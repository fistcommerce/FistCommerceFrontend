import { useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { onboardingConnectWalletPath } from '@/access/onboardingPaths'
import { isCircleWalletEnabled } from '@/circle/enabled'
import { useConnectWalletAction } from '@/hooks/useConnectWalletAction'
import { saveDashboardReturnTo } from '@/session/dashboardReturnTo'
import { useAppSelector } from '@/store/hooks'
import { parseUserRole } from '@/utils/userRole'
import type { AppWallet } from '@/wallet/appWallet'
import {
  resolveLiveWalletForWrite,
  sameLiveWalletAddress,
  sessionWalletMismatchMessage,
  waitForLiveWallet,
  type LiveWalletSnapshot,
  type LiveWalletWriteAction,
} from '@/wallet/liveWalletForWrite'
import { useActiveWallet } from '@/wallet/useActiveWallet'

export type ReconnectSessionWalletResult =
  | { status: 'connected'; wallet: AppWallet; address: string }
  | { status: 'navigated' }
  | { status: 'mismatch'; message: string }
  | { status: 'cancelled'; message: string }
  | { status: 'failed'; message: string }

export function useReconnectSessionWallet() {
  const navigate = useNavigate()
  const location = useLocation()
  const { connect: connectPrivy, pending, error, clearError } = useConnectWalletAction()
  const { ready, wallet, address } = useActiveWallet()
  const sessionWallet = useAppSelector((s) => s.auth.wallet)
  const role = parseUserRole(useAppSelector((s) => s.auth.role))
  const snapRef = useRef<LiveWalletSnapshot>({ ready, wallet, address })
  snapRef.current = { ready, wallet, address }

  const reconnect = useCallback(
    async (action: LiveWalletWriteAction = 'continue'): Promise<ReconnectSessionWalletResult> => {
      clearError()
      const current = resolveLiveWalletForWrite(snapRef.current, action)
      if (current.status === 'ready') {
        if (sessionWallet && !sameLiveWalletAddress(current.address, sessionWallet)) {
          return { status: 'mismatch', message: sessionWalletMismatchMessage() }
        }
        return { status: 'connected', wallet: current.wallet, address: current.address }
      }

      // Circle login/restore lives on the connect-wallet step (email/social/PIN + Privy).
      if (isCircleWalletEnabled()) {
        saveDashboardReturnTo(`${location.pathname}${location.search}`)
        navigate(role ? onboardingConnectWalletPath(role) : '/onboarding/choose-role')
        return { status: 'navigated' }
      }

      const opened = await connectPrivy()
      if (!opened.ok) {
        const message = opened.error?.trim() || 'Could not connect wallet. Please try again.'
        if (/reject|cancel|denied/i.test(message)) {
          return { status: 'cancelled', message: 'Wallet connection was cancelled.' }
        }
        return { status: 'failed', message }
      }

      const live = await waitForLiveWallet(() => snapRef.current, { action, timeoutMs: 5_000 })
      if (live.status !== 'ready') {
        return {
          status: 'failed',
          message: live.status === 'disconnected' ? live.message : 'Connect a wallet to continue.',
        }
      }
      if (sessionWallet && !sameLiveWalletAddress(live.address, sessionWallet)) {
        return { status: 'mismatch', message: sessionWalletMismatchMessage() }
      }
      return { status: 'connected', wallet: live.wallet, address: live.address }
    },
    [clearError, connectPrivy, location.pathname, location.search, navigate, role, sessionWallet],
  )

  return { reconnect, pending, error, clearError }
}
