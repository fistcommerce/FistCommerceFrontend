import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { sanitizeAccessToken, sanitizeRefreshToken } from '@/auth/accessTokenPolicy'
import { parseUserRole } from '@/utils/userRole'

export type UserRole = 'investor' | 'merchant'

/** `admin` = staff dashboard; `app` = investor/merchant wallet session. */
export type SessionKind = 'admin' | 'app' | null

export type AuthUser = {
  id?: string
  email?: string
}

/** Why the blocking session-expired modal is showing (app / wallet API session only). */
export type SessionExpiredReason =
  | 'refresh_expired'
  | 'refresh_failed'
  | 'missing_refresh'
  | 'header_too_large'
  | 'wallet_disconnected'
  | 'wallet_changed'
  | 'privy_logout'
  | 'chain_mismatch'

export type SessionState = {
  accessToken: string | null
  refreshToken: string | null
  user: AuthUser | null
  onboarded: boolean
  /** `null` until the user picks a role on choose-role (also cleared on onboarding URL / role mismatch). */
  role: UserRole | null
  sessionKind: SessionKind
  /**
   * API session is dead (e.g. refresh failed). Blocks dashboard/onboarding handoff until the user
   * chooses Log in again or Log out on the session-expired modal.
   */
  sessionExpired: boolean
  sessionExpiredReason: SessionExpiredReason | null
  /** When the current access token was issued (ms). Used to ignore stale 401 handlers after re-login. */
  authIssuedAt: number | null
  /**
   * Chain id bound to the API session at login (`AuthSession.chain_id`).
   * Must match the wallet's chain while logged in; mismatch forces logout / re-login.
   */
  chainId: number | null
  /** Bare wallet from login response when present. */
  wallet: string | null
  /** @deprecated Prefer kyc slice + selectIsKycVerified; kept for redux-persist migration */
  kycVerified: boolean
}

const DEFAULT_SESSION: SessionState = {
  accessToken: null,
  refreshToken: null,
  user: null,
  onboarded: false,
  role: null,
  sessionKind: null,
  sessionExpired: false,
  sessionExpiredReason: null,
  authIssuedAt: null,
  chainId: null,
  wallet: null,
  kycVerified: false,
}

const authSlice = createSlice({
  name: 'auth',
  initialState: DEFAULT_SESSION,
  reducers: {
    hydrateAuth: (_state, action: PayloadAction<SessionState>) => ({
      ...action.payload,
      accessToken: sanitizeAccessToken(action.payload.accessToken),
      refreshToken: sanitizeRefreshToken(action.payload.refreshToken),
      role: parseUserRole(action.payload.role),
      sessionKind: action.payload.sessionKind ?? null,
      sessionExpired: Boolean(action.payload.sessionExpired),
      sessionExpiredReason: action.payload.sessionExpiredReason ?? null,
      authIssuedAt:
        typeof action.payload.authIssuedAt === 'number' && Number.isFinite(action.payload.authIssuedAt)
          ? action.payload.authIssuedAt
          : null,
      chainId:
        typeof action.payload.chainId === 'number' && Number.isFinite(action.payload.chainId)
          ? Math.trunc(action.payload.chainId)
          : null,
      wallet:
        typeof action.payload.wallet === 'string' && action.payload.wallet.trim()
          ? action.payload.wallet.trim()
          : null,
    }),
    patchAuth: (state, action: PayloadAction<Partial<SessionState>>) => {
      if (action.payload.accessToken !== undefined) {
        const next = sanitizeAccessToken(action.payload.accessToken)
        // Re-login often returns the same key. Still mark it as just issued so a
        // wallet flicker in the next few seconds cannot treat the session as stale.
        if (next) {
          state.authIssuedAt = Date.now()
          state.sessionExpired = false
          state.sessionExpiredReason = null
        }
        state.accessToken = next
      }
      if (action.payload.authIssuedAt !== undefined) {
        state.authIssuedAt =
          typeof action.payload.authIssuedAt === 'number' && Number.isFinite(action.payload.authIssuedAt)
            ? action.payload.authIssuedAt
            : null
      }
      if (action.payload.refreshToken !== undefined) {
        state.refreshToken = sanitizeRefreshToken(action.payload.refreshToken)
      }
      if (action.payload.user !== undefined) state.user = action.payload.user
      if (action.payload.onboarded !== undefined) state.onboarded = action.payload.onboarded
      if (action.payload.role !== undefined) state.role = parseUserRole(action.payload.role)
      if (action.payload.sessionKind !== undefined) state.sessionKind = action.payload.sessionKind
      if (action.payload.sessionExpired !== undefined) state.sessionExpired = action.payload.sessionExpired
      if (action.payload.sessionExpiredReason !== undefined) {
        state.sessionExpiredReason = action.payload.sessionExpiredReason
      }
      if (action.payload.chainId !== undefined) {
        state.chainId =
          typeof action.payload.chainId === 'number' && Number.isFinite(action.payload.chainId)
            ? Math.trunc(action.payload.chainId)
            : null
      }
      if (action.payload.wallet !== undefined) {
        state.wallet =
          typeof action.payload.wallet === 'string' && action.payload.wallet.trim()
            ? action.payload.wallet.trim()
            : null
      }
      if (action.payload.kycVerified !== undefined) state.kycVerified = action.payload.kycVerified
    },
    resetAuth: () => DEFAULT_SESSION,
  },
})

export const { hydrateAuth, patchAuth, resetAuth } = authSlice.actions
export const authReducer = authSlice.reducer
