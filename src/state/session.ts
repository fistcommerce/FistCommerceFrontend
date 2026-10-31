import { postRefreshAuthTokens } from '@/api/walletSession'
import { store } from '@/store'
import { patchAuth, type SessionState, type UserRole } from '@/store/slices/authSlice'
import { setKycStatus } from '@/store/slices/kycSlice'
import { unlockAllOnboardingSteps, unlockOnboardingStep } from '@/store/slices/onboardingSlice'

export type { UserRole, SessionState }

function newLocalAccessToken() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `local_${crypto.randomUUID()}`
  }
  return `local_${Date.now()}`
}

export function getSession(): SessionState {
  return store.getState().auth
}

export function setSession(next: Partial<SessionState>) {
  store.dispatch(patchAuth(next))
}

/**
 * Calls `POST /auth/refresh-token` with the persisted refresh token and updates Redux.
 * @returns new tokens, or `null` if there is no refresh token or the request fails.
 */
export async function refreshSessionTokensFromApi(): Promise<{
  accessToken: string
  refreshToken: string | null
} | null> {
  const { refreshToken } = store.getState().auth
  if (!refreshToken?.trim()) return null
  try {
    const tokens = await postRefreshAuthTokens(refreshToken)
    store.dispatch(
      patchAuth({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      }),
    )
    return tokens
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/refresh token expired|invalid refresh token/i.test(message)) {
      throw error
    }
    return null
  }
}

export function setRole(role: UserRole) {
  store.dispatch(patchAuth({ role }))
}

export function unlockAfterChooseRole(role: UserRole) {
  store.dispatch(unlockOnboardingStep({ role, stepIndex: 1 }))
}

export function unlockAfterConnectWallet(role: UserRole) {
  store.dispatch(unlockOnboardingStep({ role, stepIndex: 2 }))
}

export function unlockAfterVerifyIdentity(role: UserRole) {
  store.dispatch(unlockOnboardingStep({ role, stepIndex: 3 }))
}

export function completeOnboarding(role?: UserRole) {
  const current = store.getState().auth
  const r = role ?? current.role
  if (!r) return
  const token = current.accessToken?.length ? current.accessToken : newLocalAccessToken()
  store.dispatch(unlockAllOnboardingSteps(r))
  store.dispatch(patchAuth({ onboarded: true, role: r, accessToken: token }))
}

export function setKycVerified(value: boolean) {
  store.dispatch(patchAuth({ kycVerified: value }))
  if (value) {
    store.dispatch(setKycStatus('verified'))
  } else {
    store.dispatch(setKycStatus('not_started'))
  }
}

export function setKycFlowStatus(status: import('@/store/slices/kycSlice').KycStatus) {
  store.dispatch(setKycStatus(status))
  store.dispatch(patchAuth({ kycVerified: status === 'verified' }))
}
