import { useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'

import { DashboardRequestFeedbackLayer } from '@/components/dashboard/shared/DashboardRequestFeedbackLayer'
import DashboardSessionGuard from '@/components/session/DashboardSessionGuard'
import { isUsableApiAccessToken } from '@/auth/accessTokenPolicy'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  selectInvestorDashboardError,
  selectInvestorDashboardStatus,
} from '@/store/selectors/investorDashboardSelectors'
import { refreshInvestorDashboard, setInvestorWalletDisplay } from '@/store/slices/investorDashboardSlice'
import { useActiveWallet } from '@/wallet/useActiveWallet'

function topBarWalletFromAddress(address: string): string {
  if (address.length <= 12) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export default function InvestorDashboardSessionLayout() {
  const dispatch = useAppDispatch()
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const role = useAppSelector((s) => s.auth.role)
  const sessionExpired = useAppSelector((s) => s.auth.sessionExpired)
  const status = useAppSelector(selectInvestorDashboardStatus)
  const error = useAppSelector(selectInvestorDashboardError)
  const sessionWallet = useAppSelector((s) => s.auth.wallet)
  const { isConnected, address } = useActiveWallet()
  const [errorDismissed, setErrorDismissed] = useState(false)
  const [loadingDismissed, setLoadingDismissed] = useState(false)
  const didKickoffRef = useRef(false)

  useEffect(() => {
    const shown = isConnected && address ? address : sessionWallet
    if (!shown) return
    dispatch(setInvestorWalletDisplay(topBarWalletFromAddress(shown)))
  }, [dispatch, isConnected, address, sessionWallet])

  useEffect(() => {
    didKickoffRef.current = false
    setErrorDismissed(false)
    setLoadingDismissed(false)
  }, [accessToken, role])

  useEffect(() => {
    if (didKickoffRef.current) return
    if (status !== 'idle') return
    if (!isUsableApiAccessToken(accessToken)) return
    if (role !== 'investor') return
    didKickoffRef.current = true
    void dispatch(refreshInvestorDashboard())
  }, [dispatch, status, accessToken, role])

  useEffect(() => {
    if (status === 'failed') setErrorDismissed(false)
    if (status === 'loading') setLoadingDismissed(false)
    if (status === 'succeeded') setLoadingDismissed(false)
  }, [status])

  const feedbackPhase =
    sessionExpired
      ? 'idle'
      : status === 'loading' && !loadingDismissed
        ? 'loading'
        : status === 'failed' && !errorDismissed
          ? 'failed'
          : 'idle'

  return (
    <>
      <DashboardSessionGuard />
      <DashboardRequestFeedbackLayer
        phase={feedbackPhase}
        loadingTitle="Syncing investor dashboard"
        loadingDescription="Fetching the latest data for your account…"
        errorTitle="Unable to load dashboard"
        errorDescription={error ?? undefined}
        onDismiss={() => setErrorDismissed(true)}
        onRetry={() => {
          setErrorDismissed(false)
          void dispatch(refreshInvestorDashboard())
        }}
        onCancelLoading={() => setLoadingDismissed(true)}
      />
      <Outlet />
    </>
  )
}
