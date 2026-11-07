import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'

import { DashboardRequestFeedbackLayer } from '@/components/dashboard/shared/DashboardRequestFeedbackLayer'
import { useDashboardPeriodicRefresh } from '@/hooks/useDashboardPeriodicRefresh'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { refreshAdminDashboard } from '@/store/slices/adminDashboardSlice'

export default function AdminDashboardSessionLayout() {
  const dispatch = useAppDispatch()
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const sessionKind = useAppSelector((s) => s.auth.sessionKind)
  const sessionExpired = useAppSelector((s) => s.auth.sessionExpired)
  const status = useAppSelector((s) => s.adminDashboard.status)
  const error = useAppSelector((s) => s.adminDashboard.error)
  const [loadingDismissed, setLoadingDismissed] = useState(false)
  const [errorDismissed, setErrorDismissed] = useState(false)
  const didKickoffRef = useRef(false)

  useEffect(() => {
    didKickoffRef.current = false
    setLoadingDismissed(false)
    setErrorDismissed(false)
  }, [accessToken, sessionKind])

  useEffect(() => {
    if (didKickoffRef.current) return
    if (status !== 'idle') return
    if (!accessToken?.trim()) return
    if (sessionKind !== 'admin') return
    didKickoffRef.current = true
    void dispatch(refreshAdminDashboard())
  }, [dispatch, status, accessToken, sessionKind])

  const pollEnabled =
    Boolean(accessToken?.trim()) && sessionKind === 'admin' && !sessionExpired

  const refreshInBackground = useCallback(() => {
    void dispatch(refreshAdminDashboard({ background: true }))
  }, [dispatch])

  useDashboardPeriodicRefresh({
    enabled: pollEnabled,
    onRefresh: refreshInBackground,
    isBusy: () => status === 'loading',
  })

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
      <DashboardRequestFeedbackLayer
        phase={feedbackPhase}
        loadingTitle="Syncing platform overview"
        loadingDescription="Fetching the latest admin dashboard metrics…"
        errorTitle="Unable to load dashboard"
        errorDescription={error ?? undefined}
        onDismiss={() => setErrorDismissed(true)}
        onRetry={() => {
          setErrorDismissed(false)
          void dispatch(refreshAdminDashboard())
        }}
        onCancelLoading={() => setLoadingDismissed(true)}
      />
      <Outlet />
    </>
  )
}
