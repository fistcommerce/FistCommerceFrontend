import { shouldRedirectToAdminLogin } from '@/auth/adminSession'
import type { AppDispatch } from '@/store'
import {
  patchAuth,
  type SessionExpiredReason,
  type SessionKind,
  type UserRole,
} from '@/store/slices/authSlice'
import { unlockOnboardingStep } from '@/store/slices/onboardingSlice'
import { parseUserRole } from '@/utils/userRole'

import { resetUserSession } from '@/session/resetUserSession'

const SESSION_END_STORAGE_KEY = 'fistcommerce.sessionEndMessage'

export type SessionEndReason = SessionExpiredReason

type SessionEndPayload = {
  reason: SessionEndReason
  role: UserRole | null
}

export const SESSION_END_MESSAGES: Record<SessionEndReason, string> = {
  refresh_expired: 'Your session expired. Sign in again with your wallet to continue.',
  refresh_failed: 'Your session could not be renewed. Sign in again with your wallet to continue.',
  missing_refresh: 'Your session is no longer valid. Sign in again with your wallet to continue.',
  header_too_large: 'Your saved session was corrupted. Sign in again with your wallet to continue.',
  wallet_disconnected: 'Your wallet disconnected. Reconnect and sign in again to continue.',
  wallet_changed: 'Wallet changed. Sign in again with the new wallet to continue.',
  privy_logout: 'You were signed out. Sign in again with your wallet to continue.',
  chain_mismatch:
    'This session was created on a different network. Sign in again to continue on the current network.',
}

export const ADMIN_SESSION_END_MESSAGES: Record<SessionEndReason, string> = {
  refresh_expired: 'Your admin session expired. Sign in again with your multisig owner wallet to continue.',
  refresh_failed: 'Your admin session could not be renewed. Sign in again with your multisig owner wallet.',
  missing_refresh: 'Your admin session is no longer valid. Sign in again with your multisig owner wallet.',
  header_too_large: 'Your saved admin session was corrupted. Sign in again with your multisig owner wallet.',
  wallet_disconnected: 'Your wallet disconnected. Reconnect and sign in again to continue.',
  wallet_changed: 'Wallet changed. Sign in again with your multisig owner wallet to continue.',
  privy_logout: 'You were signed out. Sign in again with your multisig owner wallet to continue.',
  chain_mismatch:
    'This admin session was created on a different network. Sign in again to continue on the current network.',
}

export function getSessionEndMessage(
  reason: SessionEndReason | null | undefined,
  options?: { isAdmin?: boolean },
): string {
  const messages = options?.isAdmin ? ADMIN_SESSION_END_MESSAGES : SESSION_END_MESSAGES
  if (!reason || !(reason in messages)) {
    return messages.refresh_expired
  }
  return messages[reason]
}

export function stashSessionEndMessage(reason: SessionEndReason, role: UserRole | null = null): void {
  if (typeof window === 'undefined') return
  try {
    const payload: SessionEndPayload = { reason, role }
    window.sessionStorage.setItem(SESSION_END_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* ignore quota / private mode */
  }
}

/** Read and clear a pending session-end message (for connect-wallet and admin login). */
export function consumeSessionEndMessage(options?: { isAdmin?: boolean }): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(SESSION_END_STORAGE_KEY)
    if (!raw) return null
    window.sessionStorage.removeItem(SESSION_END_STORAGE_KEY)
    const parsed = JSON.parse(raw) as Partial<SessionEndPayload>
    const reason = parsed.reason
    if (!reason || !(reason in SESSION_END_MESSAGES)) return null
    return getSessionEndMessage(reason, options)
  } catch {
    try {
      window.sessionStorage.removeItem(SESSION_END_STORAGE_KEY)
    } catch {
      /* ignore */
    }
    return null
  }
}

export function connectWalletPathForRole(role: UserRole | null): string {
  if (role === 'investor' || role === 'merchant') {
    return `/onboarding/${role}/connect-wallet`
  }
  return '/onboarding/choose-role'
}

type SessionEndOptions = {
  reason: SessionEndReason
  accessToken?: string | null
  sessionKind?: SessionKind
  role?: string | null
  /** Prefer keeping the user’s onboarding branch so they don’t re-pick role. */
  keepRole?: boolean
}

let sessionEndInFlight: Promise<void> | null = null

/** Clears admin API tokens but keeps `sessionKind: 'admin'` so recovery stays on admin login. */
function clearAdminSessionKeepingKind(dispatch: AppDispatch, reason: SessionEndReason): void {
  stashSessionEndMessage(reason, null)
  dispatch(
    patchAuth({
      accessToken: null,
      refreshToken: null,
      user: null,
      role: null,
      sessionKind: 'admin',
      sessionExpired: true,
      sessionExpiredReason: reason,
      chainId: null,
      wallet: null,
    }),
  )
}

function clearAppSessionKeepingRole(
  dispatch: AppDispatch,
  reason: SessionEndReason,
  role: UserRole | null,
  keepRole: boolean,
): void {
  stashSessionEndMessage(reason, role)
  resetUserSession(dispatch)
  if (keepRole && role) {
    dispatch(
      patchAuth({
        role,
        sessionExpired: true,
        sessionExpiredReason: reason,
      }),
    )
    // resetOnboardingProgress leaves maxStep at 0; unlock connect-wallet so guards
    // do not bounce to choose-role after a wallet/session end.
    dispatch(unlockOnboardingStep({ role, stepIndex: 1 }))
  } else {
    dispatch(
      patchAuth({
        sessionExpired: true,
        sessionExpiredReason: reason,
      }),
    )
  }
}

/**
 * Clears API credentials and opens the in-app session-expired modal (no hard navigation).
 * Used when refresh fails so the user can Log in again or Log out.
 * Admin sessions keep `sessionKind: 'admin'` so Log in again returns to `/admin/login`.
 */
export async function markAppSessionExpired(
  dispatch: AppDispatch,
  options: SessionEndOptions,
): Promise<void> {
  if (sessionEndInFlight) return sessionEndInFlight

  sessionEndInFlight = (async () => {
    const pathname = typeof window !== 'undefined' ? window.location.pathname : undefined
    if (
      shouldRedirectToAdminLogin({
        accessToken: options.accessToken,
        sessionKind: options.sessionKind,
        pathname,
      })
    ) {
      clearAdminSessionKeepingKind(dispatch, options.reason)
      const { persistor } = await import('@/store')
      await persistor.flush()
      return
    }

    const role = parseUserRole(options.role)
    const keepRole = options.keepRole !== false
    clearAppSessionKeepingRole(dispatch, options.reason, role, keepRole)

    const { persistor } = await import('@/store')
    await persistor.flush()
  })().finally(() => {
    sessionEndInFlight = null
  })

  return sessionEndInFlight
}

/**
 * Ends an investor/merchant app session with a user-visible reason, keeps role when known,
 * and lands on the matching connect-wallet step (used for wallet disconnect / Privy logout).
 */
export async function endAppSessionAndRedirect(
  dispatch: AppDispatch,
  options: SessionEndOptions,
): Promise<void> {
  if (sessionEndInFlight) return sessionEndInFlight

  sessionEndInFlight = (async () => {
    const pathname = typeof window !== 'undefined' ? window.location.pathname : undefined
    if (
      shouldRedirectToAdminLogin({
        accessToken: options.accessToken,
        sessionKind: options.sessionKind,
        pathname,
      })
    ) {
      const { logoutAdminSession } = await import('@/session/logoutAdminSession')
      await logoutAdminSession(dispatch)
      return
    }

    const role = parseUserRole(options.role)
    const keepRole = options.keepRole !== false
    // Hard redirect path: leave sessionExpired false so the modal does not open on connect-wallet.
    stashSessionEndMessage(options.reason, role)
    resetUserSession(dispatch)
    if (keepRole && role) {
      dispatch(patchAuth({ role }))
      dispatch(unlockOnboardingStep({ role, stepIndex: 1 }))
    }

    const { persistor } = await import('@/store')
    await persistor.flush()

    const path = connectWalletPathForRole(keepRole ? role : null)
    window.location.assign(path)
  })().finally(() => {
    sessionEndInFlight = null
  })

  return sessionEndInFlight
}
