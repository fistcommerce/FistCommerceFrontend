import { useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'

import { DashboardRequestFeedbackLayer } from '@/components/dashboard/shared/DashboardRequestFeedbackLayer'
import DashboardSessionGuard from '@/components/session/DashboardSessionGuard'
import { isUsableApiAccessToken } from '@/auth/accessTokenPolicy'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  selectMerchantDashboardError,
  selectMerchantDashboardStatus,
} from '@/store/selectors/merchantDashboardSelectors'
import { selectIsKycVerified } from '@/store/selectors/sessionSelectors'
import { refreshMerchantDashboard, setMerchantWalletDisplay } from '@/store/slices/merchantDashboardSlice'
import { useActiveWallet } from '@/wallet/useActiveWallet'
import { refreshMerchantReceivables } from '@/store/slices/merchantReceivablesSlice'

export default function MerchantDashboardSessionLayout() {
  const dispatch = useAppDispatch()
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const role = useAppSelector((s) => s.auth.role)
  const sessionExpired = useAppSelector((s) => s.auth.sessionExpired)
  const status = useAppSelector(selectMerchantDashboardStatus)
  const error = useAppSelector(selectMerchantDashboardError)
  const kycVerified = useAppSelector(selectIsKycVerified)
  const sessionWallet = useAppSelector((s) => s.auth.wallet)
  const { isConnected, address } = useActiveWallet()
  const [errorDismissed, setErrorDismissed] = useState(false)
  const [loadingDismissed, setLoadingDismissed] = useState(false)
  const didKickoffRef = useRef(false)
  const didReceivablesRef = useRef(false)

  useEffect(() => {
    const shown = isConnected && address ? address : sessionWallet
    if (!shown) return
    const display = shown.length <= 12 ? shown : `${shown.slice(0, 6)}...${shown.slice(-4)}`
    dispatch(setMerchantWalletDisplay(display))
  }, [dispatch, isConnected, address, sessionWallet])

  useEffect(() => {
    didKickoffRef.current = false
    didReceivablesRef.current = false
    setErrorDismissed(false)
    setLoadingDismissed(false)
  }, [accessToken, role])

  useEffect(() => {
    if (didKickoffRef.current) return
    if (status !== 'idle') return
    if (!isUsableApiAccessToken(accessToken)) return
    if (role !== 'merchant') return
    didKickoffRef.current = true
    void dispatch(refreshMerchantDashboard())
  }, [dispatch, status, accessToken, role])

  // After dashboard/KYC hydration: only fully verified merchants load GET /api/loan/request.
  useEffect(() => {
    if (!didKickoffRef.current) return
    if (!isUsableApiAccessToken(accessToken)) return
    if (role !== 'merchant') return
    if (status !== 'succeeded' && status !== 'failed') return
    if (!kycVerified) return
    if (didReceivablesRef.current) return
    didReceivablesRef.current = true
    void dispatch(refreshMerchantReceivables())
  }, [dispatch, accessToken, role, status, kycVerified])

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
        loadingTitle="Syncing merchant dashboard"
        loadingDescription="Fetching the latest data for your account…"
        errorTitle="Unable to load dashboard"
        errorDescription={error ?? undefined}
        onDismiss={() => setErrorDismissed(true)}
        onRetry={() => {
          setErrorDismissed(false)
          didReceivablesRef.current = false
          void dispatch(refreshMerchantDashboard())
        }}
        onCancelLoading={() => setLoadingDismissed(true)}
      />
      <Outlet />
    </>
  )
}
