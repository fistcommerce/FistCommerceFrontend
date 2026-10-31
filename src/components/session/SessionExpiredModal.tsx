import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'

import { ADMIN_LOGIN_PATH, shouldRedirectToAdminLogin } from '@/auth/adminSession'
import DashboardErrorModal from '@/components/dashboard/shared/DashboardErrorModal'
import {
  connectWalletPathForRole,
  getSessionEndMessage,
  stashSessionEndMessage,
} from '@/session/sessionEnd'
import { logoutAdminSession } from '@/session/logoutAdminSession'
import { logoutUserSession } from '@/session/logoutUserSession'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { patchAuth } from '@/store/slices/authSlice'
import { parseUserRole } from '@/utils/userRole'
import { useActiveWallet } from '@/wallet/useActiveWallet'

/**
 * Blocking modal when API refresh fails. User must Log in again (re-sign) or Log out (Privy disconnect).
 * Admin sessions recover via `/admin/login`, not user onboarding.
 */
export default function SessionExpiredModal() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { logout, unlinkWallet } = usePrivy()
  const { wallet } = useActiveWallet()
  const sessionExpired = useAppSelector((s) => s.auth.sessionExpired)
  const sessionExpiredReason = useAppSelector((s) => s.auth.sessionExpiredReason)
  const sessionKind = useAppSelector((s) => s.auth.sessionKind)
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const roleRaw = useAppSelector((s) => s.auth.role)
  const role = parseUserRole(roleRaw)

  const [loggingOut, setLoggingOut] = useState(false)

  if (!sessionExpired) return null
  // Connect-wallet and the rest of onboarding already show the session-end message inline.
  if (pathname === '/onboarding' || pathname.startsWith('/onboarding/')) return null

  const isAdminRecovery = shouldRedirectToAdminLogin({
    accessToken,
    sessionKind,
    pathname,
  })
  const message = getSessionEndMessage(sessionExpiredReason, { isAdmin: isAdminRecovery })

  const handleLogInAgain = () => {
    if (loggingOut) return
    if (sessionExpiredReason) {
      stashSessionEndMessage(sessionExpiredReason, isAdminRecovery ? null : role)
    }
    dispatch(
      patchAuth({
        sessionExpired: false,
        sessionExpiredReason: null,
        ...(isAdminRecovery ? { sessionKind: 'admin' as const } : {}),
      }),
    )
    navigate(isAdminRecovery ? ADMIN_LOGIN_PATH : connectWalletPathForRole(role), { replace: true })
  }

  const handleLogOut = () => {
    if (loggingOut) return
    setLoggingOut(true)
    if (isAdminRecovery) {
      void logoutAdminSession(dispatch).catch(() => {
        setLoggingOut(false)
      })
      return
    }
    void logoutUserSession(dispatch, wallet, logout, { unlinkWallet }).catch(() => {
      setLoggingOut(false)
    })
  }

  return (
    <DashboardErrorModal
      open
      blocking
      title="Your session expired"
      message={message}
      onClose={() => {}}
      onRetry={handleLogInAgain}
      retryLabel={loggingOut ? 'Please wait…' : 'Log in again'}
      retryDisabled={loggingOut}
      onSecondary={handleLogOut}
      secondaryLabel={loggingOut ? 'Logging out…' : 'Log out'}
    />
  )
}
