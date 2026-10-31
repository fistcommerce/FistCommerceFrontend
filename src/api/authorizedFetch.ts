import type { SessionEndReason } from '@/session/sessionEnd'

/** Marks that token refresh already ran for this logical request (prevents refresh loops). */
const AUTH_RETRIED = Symbol('authRetried')

/**
 * Ignore session-expiry briefly after a fresh login for *stale* in-flight 401s.
 * Never used after a refresh+retry for the same logical request (see skipFreshAuthGrace).
 */
const FRESH_AUTH_GRACE_MS = 15_000

type AuthRecoveryInit = RequestInit & {
  [AUTH_RETRIED]?: boolean
}

function hasAuthRetried(init: RequestInit): boolean {
  return Boolean((init as AuthRecoveryInit)[AUTH_RETRIED])
}

/** Unauthenticated — refresh/logout path. Permission 403 is returned to the caller (not a session wipe). */
function isAuthFailureStatus(status: number): boolean {
  return status === 401
}

function authorizationHeaderFromInit(headers: RequestInit['headers']): string | null {
  if (!headers) return null
  if (headers instanceof Headers) {
    return headers.get('Authorization') ?? headers.get('authorization')
  }
  if (Array.isArray(headers)) {
    for (const [k, v] of headers) {
      if (k.toLowerCase() === 'authorization' && typeof v === 'string') return v
    }
    return null
  }
  const rec = headers as Record<string, string>
  const a = rec.Authorization ?? rec.authorization
  return typeof a === 'string' ? a : null
}

function accessTokenFromAuthHeader(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null
  const trimmed = authHeader.trim()
  const match = /^Token\s+(\S+)/i.exec(trimmed)
  return match?.[1]?.trim() ?? null
}

function usesDrfTokenAuth(headers: RequestInit['headers']): boolean {
  const raw = authorizationHeaderFromInit(headers)
  if (!raw) return false
  return /^Token\s+\S+/i.test(raw.trim())
}

async function readFailureBodySnippet(res: Response): Promise<string> {
  try {
    return (await res.clone().text()).slice(0, 4096)
  } catch {
    return ''
  }
}

/** Flatten common DRF / API error shapes into one searchable string. */
function normalizeAuthFailureMessage(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const rec = parsed as Record<string, unknown>
      const parts: string[] = []
      for (const key of ['detail', 'message', 'error', 'code', 'error_code', 'errorCode']) {
        const v = rec[key]
        if (typeof v === 'string' && v.trim()) parts.push(v.trim())
        else if (Array.isArray(v)) {
          for (const item of v) {
            if (typeof item === 'string' && item.trim()) parts.push(item.trim())
          }
        }
      }
      if (parts.length) return parts.join(' ')
    }
  } catch {
    /* plain text body */
  }
  return trimmed
}

/** Backend denied the call because KYC / identity / insurance is incomplete — not a dead session. */
function isVerificationDenialMessage(message: string): boolean {
  const t = message.trim()
  if (!t) return false
  return (
    /kyc.*(required|incomplete|not verified|pending)/i.test(t) ||
    /complete.*(kyc|identity|verification)/i.test(t) ||
    /identity verification required/i.test(t) ||
    /verification required/i.test(t) ||
    /not (yet )?verified/i.test(t) ||
    /insurance.*(required|not verified|pending)/i.test(t) ||
    /kyb/i.test(t)
  )
}

type RefreshSessionResult = Awaited<
  ReturnType<typeof import('@/state/session').refreshSessionTokensFromApi>
>

let refreshCoalesce: Promise<RefreshSessionResult> | null = null

function coalescedRefreshSessionTokens(): Promise<RefreshSessionResult> {
  if (!refreshCoalesce) {
    refreshCoalesce = import('@/state/session')
      .then((m) => m.refreshSessionTokensFromApi())
      .finally(() => {
        refreshCoalesce = null
      })
  }
  return refreshCoalesce
}

function isWithinFreshAuthGrace(authIssuedAt: number | null | undefined): boolean {
  if (authIssuedAt == null || !Number.isFinite(authIssuedAt)) return false
  return Date.now() - authIssuedAt < FRESH_AUTH_GRACE_MS
}

async function endSessionAfterAuthFailure(
  reason: SessionEndReason,
  options?: {
    failedAccessToken?: string | null
    /** When true, do not suppress expiry after a successful refresh (retry still 401). */
    skipFreshAuthGrace?: boolean
  },
): Promise<void> {
  const { store } = await import('@/store')
  const { role: roleRaw, accessToken, sessionKind, authIssuedAt } = store.getState().auth

  if (options?.failedAccessToken) {
    const current = accessToken?.trim()
    const failed = options.failedAccessToken.trim()
    // Another login already replaced the token this request used — ignore stale 401.
    if (current && failed && current !== failed) {
      return
    }
    // Session was already cleared. A late 401 must not raise the expired modal again.
    if (!current && failed) {
      return
    }
  }

  if (!options?.skipFreshAuthGrace && isWithinFreshAuthGrace(authIssuedAt)) {
    return
  }

  const { markAppSessionExpired } = await import('@/session/sessionEnd')
  await markAppSessionExpired(store.dispatch, {
    reason,
    accessToken,
    sessionKind,
    role: roleRaw,
    keepRole: true,
  })
}

function isExpiredCredentialMessage(message: string): boolean {
  return /session expired|refresh token expired|invalid refresh token|invalid token|token expired|token not valid/i.test(
    message,
  )
}

/**
 * Performs `fetch`, then:
 * - **401** + Token auth:
 *   - KYC / verification denial body → return to caller (no refresh, no sign-out).
 *   - Expired access session → refresh once and retry.
 *   - Sign out only when the refresh token is expired or invalid, or the access token is
 *     rejected and there is no refresh token left to renew it.
 * - Oversized headers, wallet/chain changes, and **403** permission errors do not end the session.
 *
 * Uses dynamic `import()` for the Redux store and session refresh so this module does not create a
 * circular dependency with `store/index.ts`.
 */
export async function fetchWithAuthRecovery(
  input: RequestInfo | URL,
  init: AuthRecoveryInit = {},
): Promise<Response> {
  const requestAuthHeader = authorizationHeaderFromInit(init.headers)
  const requestAccessToken = accessTokenFromAuthHeader(requestAuthHeader)

  const res = await fetch(input, init)
  if (res.ok) {
    return res
  }

  const tokenAuth = usesDrfTokenAuth(init.headers)
  if (!isAuthFailureStatus(res.status) || !tokenAuth) {
    return res
  }

  const failureMessage = normalizeAuthFailureMessage(await readFailureBodySnippet(res))

  // Verification gates are not session expiry — never refresh/expire for them.
  if (isVerificationDenialMessage(failureMessage)) {
    return res
  }

  if (!isExpiredCredentialMessage(failureMessage)) {
    return res
  }

  const { store } = await import('@/store')
  const state = store.getState()

  if (hasAuthRetried(init)) {
    await endSessionAfterAuthFailure('refresh_expired', {
      failedAccessToken: requestAccessToken,
      skipFreshAuthGrace: true,
    })
    return res
  }

  const { refreshToken } = state.auth
  if (!refreshToken?.trim()) {
    await endSessionAfterAuthFailure('refresh_expired', {
      failedAccessToken: requestAccessToken,
    })
    return res
  }

  let tokens: RefreshSessionResult
  try {
    tokens = await coalescedRefreshSessionTokens()
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/refresh token expired|invalid refresh token/i.test(message)) {
      await endSessionAfterAuthFailure('refresh_expired', {
        failedAccessToken: requestAccessToken,
        skipFreshAuthGrace: true,
      })
    }
    return res
  }
  if (!tokens) {
    return res
  }

  const nextHeaders = new Headers(init.headers)
  nextHeaders.set('Authorization', `Token ${tokens.accessToken.trim()}`)
  return fetchWithAuthRecovery(input, {
    ...init,
    headers: nextHeaders,
    [AUTH_RETRIED]: true,
  })
}
