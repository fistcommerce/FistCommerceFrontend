import { useEffect } from 'react'

import { isUsableApiAccessToken } from '@/auth/accessTokenPolicy'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { selectIsPersistReady } from '@/store/selectors/sessionSelectors'
import { patchAuth } from '@/store/slices/authSlice'

/**
 * Clears a sticky “session expired” flag when no credentials remain.
 * A chain id on the wallet does not end the API session.
 */
export default function AuthSessionChainGuard() {
  const dispatch = useAppDispatch()
  const persistedReady = useAppSelector(selectIsPersistReady)
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const refreshToken = useAppSelector((s) => s.auth.refreshToken)
  const sessionExpired = useAppSelector((s) => s.auth.sessionExpired)

  useEffect(() => {
    if (!persistedReady) return

    const hasUsableTokens =
      Boolean(refreshToken?.trim()) || isUsableApiAccessToken(accessToken)

    // Sticky expired flag with no session — dismiss modal without wiping onboarding role.
    if (sessionExpired && !hasUsableTokens) {
      dispatch(
        patchAuth({
          sessionExpired: false,
          sessionExpiredReason: null,
          accessToken: null,
          refreshToken: null,
          chainId: null,
          wallet: null,
        }),
      )
    }
  }, [dispatch, persistedReady, accessToken, refreshToken, sessionExpired])

  return null
}
