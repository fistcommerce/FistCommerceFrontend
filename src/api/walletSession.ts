import { getAddress, type Address, type Hex } from 'viem'

import { parseJsonResponse, requireApiBaseUrl } from '@/api/client'
import type { KycStatus } from '@/store/slices/kycSlice'
import type { AuthUser, UserRole } from '@/store/slices/authSlice'

/**
 * Auth endpoints per OpenAPI (`basePath` `/api` — use `VITE_API_BASE_URL` like `http://127.0.0.1:8000/api`).
 * Docs: http://127.0.0.1:8000/redoc/ — schema: http://127.0.0.1:8000/swagger.json
 *
 * - `POST /api/auth/login` — body: `signedMessage`, `signature`, `signerAddress`, **`role`**, **`chainId`**
 *   (`chainId` must match the EIP-712 domain chainId used to sign).
 * - `POST /api/auth/refresh-token` — body: `refresh_token` (chain stays on the server session).
 *
 * Successful responses use **`access_token`** and **`refresh_token`** (snake_case in JSON), and may include
 * **`has_registered_profile`**, **`chain_id`**, and **`wallet`**.
 */

const LOGIN_PATH = '/api/auth/login'
const REFRESH_PATH = '/api/auth/refresh-token'

/** OpenAPI 200 body for `POST /auth/login`. */
export type AuthLoginResponseBody = {
  successMessage?: string
  access_token: string
  refresh_token?: string
  /**
   * When true, the wallet already has a saved profile — skip registration/onboarding and go to the dashboard.
   */
  has_registered_profile?: boolean
  /** @deprecated Prefer `has_registered_profile` */
  registered?: boolean
  is_registered?: boolean
  onboarded?: boolean
  is_onboarded?: boolean
  kyc_status?: string
  kycStatus?: string
  user?: AuthUser
  role?: string
  /** Session-bound chain from login (must match the `chainId` sent in the request). */
  chain_id?: number
  /** Bare wallet address for this session (not a composite `wallet:chainId` key). */
  wallet?: string
}

/** OpenAPI 200 body for `POST /auth/refresh-token`. */
export type AuthRefreshResponseBody = {
  successMessage?: string
  access_token: string
  refresh_token?: string
}

export type WalletSessionTokens = {
  accessToken: string
  refreshToken: string | null
}

const KYC_STATUSES: readonly KycStatus[] = ['not_started', 'pending', 'verified', 'rejected']

function parseKycStatusFromLoginBody(body: AuthLoginResponseBody): KycStatus {
  const raw = body.kyc_status ?? body.kycStatus
  if (typeof raw === 'string' && (KYC_STATUSES as readonly string[]).includes(raw)) {
    return raw as KycStatus
  }
  return 'not_started'
}

function parseRoleFromLoginBody(body: AuthLoginResponseBody): UserRole | null {
  const raw = body.role
  if (raw === 'investor' || raw === 'merchant') return raw
  return null
}

export type WalletLoginResult = WalletSessionTokens & {
  /** Derived from `has_registered_profile` (and legacy `registered` / `is_registered` if present). */
  registered: boolean
  onboarded: boolean
  kycStatus: KycStatus
  user: AuthUser | null
  /** Role returned by the API, if any — otherwise use the role chosen in onboarding. */
  roleFromApi: UserRole | null
  /** Prefer API `chain_id`; null when the backend omits it. */
  chainId: number | null
  /** Bare wallet from API when present. */
  wallet: string | null
}

function normalizeSessionTokens(
  body: Partial<AuthLoginResponseBody & AuthRefreshResponseBody & { token?: string }>,
): WalletSessionTokens {
  const accessRaw = body.access_token ?? body.token
  const access = typeof accessRaw === 'string' ? accessRaw.trim() : ''
  if (!access) {
    throw new Error('Server did not return an access token.')
  }
  const refreshRaw = body.refresh_token
  const refresh = typeof refreshRaw === 'string' ? refreshRaw.trim() : ''
  return {
    accessToken: access,
    refreshToken: refresh.length ? refresh : null,
  }
}

/** Same structure as backend `_auth_typed_data` / `eth_signTypedData_v4` payload. */
const AUTH_LOGIN_TYPES = {
  EIP712Domain: [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
  ],
  Auth: [
    { name: 'wallet', type: 'address' },
    { name: 'issuedAt', type: 'uint256' },
    { name: 'action', type: 'string' },
    { name: 'nonce', type: 'string' },
  ],
} as const satisfies Record<string, readonly { name: string; type: string }[]>

function loginEip712Domain(chainId: number) {
  const verifying = (
    import.meta.env.VITE_AUTH_EIP712_VERIFYING_CONTRACT?.trim() ||
    '0x0000000000000000000000000000000000000000'
  ) as Address
  return {
    name:
      import.meta.env.VITE_AUTH_EIP712_DOMAIN_NAME?.trim() || 'FistCommerce Authentication',
    version: import.meta.env.VITE_AUTH_EIP712_DOMAIN_VERSION?.trim() || '1',
    chainId,
    verifyingContract: verifying,
  }
}

function loginTypesForSign(): Record<string, Array<{ name: string; type: string }>> {
  return {
    EIP712Domain: AUTH_LOGIN_TYPES.EIP712Domain.map((f) => ({ ...f })),
    Auth: AUTH_LOGIN_TYPES.Auth.map((f) => ({ ...f })),
  }
}

export type WalletLoginSignable = {
  domain: ReturnType<typeof loginEip712Domain>
  types: Record<string, Array<{ name: string; type: string }>>
  primaryType: 'Auth'
  message: {
    wallet: Address
    issuedAt: bigint
    action: 'login'
    nonce: string
  }
  signedMessageForApi: {
    wallet: string
    issuedAt: number
    action: 'login'
    nonce: string
  }
}

function isStellarAccountAddress(wallet: string): boolean {
  const raw = wallet.trim().toUpperCase()
  return raw.startsWith('G') && raw.length === 56
}

export function createWalletLoginSignable(
  chainId: number,
  wallet: Address | string,
): WalletLoginSignable {
  const walletNorm = isStellarAccountAddress(wallet)
    ? wallet.trim().toUpperCase()
    : getAddress(wallet as Address)
  const issuedAt = BigInt(Math.floor(Date.now() / 1000))
  const nonce =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`

  const message = {
    wallet: walletNorm as Address,
    issuedAt,
    action: 'login' as const,
    nonce,
  }

  return {
    domain: loginEip712Domain(chainId),
    types: loginTypesForSign(),
    primaryType: 'Auth',
    message,
    signedMessageForApi: {
      wallet: walletNorm,
      issuedAt: Number(issuedAt),
      action: 'login',
      nonce,
    },
  }
}

function parseChainIdFromLoginBody(body: AuthLoginResponseBody): number | null {
  const raw = body.chain_id
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.trunc(raw)
  return null
}

export async function postWalletLogin(params: {
  signedMessage: WalletLoginSignable['signedMessageForApi']
  signature: Hex | string
  signerAddress: string
  /** Required by API — must match the onboarding role the user selected. */
  role: UserRole
  /**
   * Required by API — must match the EIP-712 domain `chainId` used to sign
   * (and the active `APP_CHAIN.id`), or Stellar Testnet chain id.
   */
  chainId: number
}): Promise<WalletLoginResult> {
  const base = requireApiBaseUrl()
  const signerAddress = isStellarAccountAddress(params.signerAddress)
    ? params.signerAddress.trim().toUpperCase()
    : getAddress(params.signerAddress as Address)
  const res = await fetch(`${base}${LOGIN_PATH}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      signedMessage: params.signedMessage,
      signature: params.signature,
      signerAddress,
      role: params.role,
      chainId: params.chainId,
    }),
  })
  const body = await parseJsonResponse<AuthLoginResponseBody & { token?: string }>(res)
  const tokens = normalizeSessionTokens(body)
  const registered = Boolean(
    body.has_registered_profile ?? body.registered ?? body.is_registered,
  )
  const onboarded = Boolean(body.onboarded ?? body.is_onboarded)
  const wallet =
    typeof body.wallet === 'string' && body.wallet.trim() ? body.wallet.trim() : null
  return {
    ...tokens,
    registered,
    onboarded,
    kycStatus: parseKycStatusFromLoginBody(body),
    user: body.user ?? null,
    roleFromApi: parseRoleFromLoginBody(body),
    chainId: parseChainIdFromLoginBody(body),
    wallet,
  }
}

/**
 * Exchange a refresh token for new access (and optionally refresh) tokens.
 * OpenAPI: `POST /auth/refresh-token` with `{ "refresh_token": "..." }`.
 */
export async function postRefreshAuthTokens(refreshToken: string): Promise<WalletSessionTokens> {
  const trimmed = refreshToken.trim()
  if (!trimmed) {
    throw new Error('Refresh token is empty.')
  }
  const base = requireApiBaseUrl()
  const res = await fetch(`${base}${REFRESH_PATH}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: trimmed }),
  })
  const body = await parseJsonResponse<AuthRefreshResponseBody & { token?: string }>(res)
  return normalizeSessionTokens(body)
}
