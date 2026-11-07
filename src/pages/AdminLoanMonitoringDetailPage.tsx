import { useCallback, useEffect, useMemo } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import {
  loanMonitoringPrivilegedActionLabels,
  PrivilegedActionFeedbackLayer,
  resolveAdminWriteOutcome,
} from '@/admin/governance'
import {
  ADMIN_LOAN_MONITORING_FUNDING_APPROVAL_FOCUS_VALUE,
  ADMIN_LOAN_MONITORING_LIST_PATH,
  ADMIN_LOAN_MONITORING_PAYOUT_FOCUS_QUERY_KEY,
  ADMIN_LOAN_MONITORING_RETURN_QUERY_KEY,
  AdminLoanMonitoringDetailView,
  resolveAdminLoanMonitoringBackTarget,
} from '@/components/admin/loan-monitoring'
import { AdminPageFrame } from '@/components/admin/primitives'
import { DashboardRequestFeedbackLayer } from '@/components/dashboard/shared/DashboardRequestFeedbackLayer'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { useCancellableThunkDispatch } from '@/hooks/useCancellableThunkDispatch'
import {
  approveAdminLoanMonitoringLoan,
  cancelFundingAdminLoanMonitoringLoan,
  clearAdminLoanMonitoringActionError,
  fundAdminLoanMonitoringLoan,
  initiateAdminLoanMonitoringPayout,
  markAdminLoanMonitoringLoanDefaulted,
  refreshAdminLoanMonitoringDetail,
  rejectAdminLoanMonitoringLoan,
  selectLoanMonitoringDetail,
  writeOffAdminLoanMonitoringShortfall,
} from '@/store/slices/adminLoanMonitoringSlice'

const AdminLoanMonitoringDetailPage = () => {
  const dispatch = useAppDispatch()
  const { dispatchCancellable, cancelPending } = useCancellableThunkDispatch()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { loanId } = useParams<{ loanId: string }>()
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const sessionKind = useAppSelector((s) => s.auth.sessionKind)
  const detailStatus = useAppSelector((s) => s.adminLoanMonitoring.detailStatus)
  const detailLoanId = useAppSelector((s) => s.adminLoanMonitoring.detailLoanId)
  const actionStatus = useAppSelector((s) => s.adminLoanMonitoring.actionStatus)
  const actionKind = useAppSelector((s) => s.adminLoanMonitoring.actionKind)
  const actionError = useAppSelector((s) => s.adminLoanMonitoring.actionError)
  const actionLoanId = useAppSelector((s) => s.adminLoanMonitoring.actionLoanId)
  const lastActionOutcome = useAppSelector((s) => s.adminLoanMonitoring.lastActionOutcome)
  const detail = useAppSelector((s) =>
    loanId ? selectLoanMonitoringDetail(s.adminLoanMonitoring, loanId) : null,
  )

  const backHref = resolveAdminLoanMonitoringBackTarget(
    searchParams.get(ADMIN_LOAN_MONITORING_RETURN_QUERY_KEY),
  )

  const handleBack = useCallback(() => {
    navigate(backHref)
  }, [navigate, backHref])

  useEffect(() => {
    if (!loanId?.trim()) return
    if (!accessToken?.trim() || sessionKind !== 'admin') return
    void dispatch(refreshAdminLoanMonitoringDetail({ loanId }))
  }, [dispatch, loanId, accessToken, sessionKind])

  useEffect(() => {
    if (!detail) return
    const focus = searchParams.get(ADMIN_LOAN_MONITORING_PAYOUT_FOCUS_QUERY_KEY)
    if (focus !== ADMIN_LOAN_MONITORING_FUNDING_APPROVAL_FOCUS_VALUE) return
    const el = document.getElementById('loan-funding-approval-section')
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [detail, searchParams])

  const actionLoading = actionStatus === 'loading'
  const actionPhase = actionStatus === 'idle' ? 'idle' : actionStatus

  const resolvedActionOutcome = useMemo(
    () => (lastActionOutcome ? resolveAdminWriteOutcome(lastActionOutcome) : null),
    [lastActionOutcome],
  )

  const actionLabels = useMemo(
    () => loanMonitoringPrivilegedActionLabels(actionKind),
    [actionKind],
  )

  const handleDismissActionFeedback = useCallback(() => {
    dispatch(clearAdminLoanMonitoringActionError())
  }, [dispatch])

  const handleRetryAction = useCallback(() => {
    if (!loanId || !actionKind) return
    if (actionKind === 'approve') {
      dispatchCancellable(approveAdminLoanMonitoringLoan({ loanId }))
    } else if (actionKind === 'reject') {
      dispatchCancellable(rejectAdminLoanMonitoringLoan({ loanId }))
    } else if (actionKind === 'fund' && detail?.receivableId) {
      dispatchCancellable(fundAdminLoanMonitoringLoan({ loanId, receivableId: detail.receivableId }))
    } else if (actionKind === 'initiatePayout' && detail?.receivableId) {
      dispatchCancellable(
        initiateAdminLoanMonitoringPayout({ loanId, receivableId: detail.receivableId }),
      )
    } else if (actionKind === 'cancelFunding' && detail?.receivableId) {
      dispatchCancellable(
        cancelFundingAdminLoanMonitoringLoan({ loanId, receivableId: detail.receivableId }),
      )
    } else if (actionKind === 'markDefaulted') {
      dispatchCancellable(markAdminLoanMonitoringLoanDefaulted({ loanId }))
    } else if (actionKind === 'writeOffShortfall') {
      dispatchCancellable(writeOffAdminLoanMonitoringShortfall({ loanId }))
    }
  }, [dispatchCancellable, loanId, actionKind, detail?.receivableId])

  const handleApprove = useCallback(() => {
    if (!loanId || actionLoading) return
    dispatchCancellable(approveAdminLoanMonitoringLoan({ loanId }))
  }, [dispatchCancellable, loanId, actionLoading])

  const handleReject = useCallback(() => {
    if (!loanId || actionLoading) return
    dispatchCancellable(rejectAdminLoanMonitoringLoan({ loanId }))
  }, [dispatchCancellable, loanId, actionLoading])

  const handleApproveFunding = useCallback(() => {
    if (!loanId || !detail?.receivableId || actionLoading) return
    dispatchCancellable(fundAdminLoanMonitoringLoan({ loanId, receivableId: detail.receivableId }))
  }, [dispatchCancellable, loanId, detail?.receivableId, actionLoading])

  const handleMarkDefaulted = useCallback(() => {
    if (!loanId || actionLoading) return
    dispatchCancellable(markAdminLoanMonitoringLoanDefaulted({ loanId }))
  }, [dispatchCancellable, loanId, actionLoading])

  const handleWriteOffShortfall = useCallback(() => {
    if (!loanId || actionLoading) return
    dispatchCancellable(writeOffAdminLoanMonitoringShortfall({ loanId }))
  }, [dispatchCancellable, loanId, actionLoading])

  const detailLoadFailed = useMemo(
    () => detailStatus === 'failed' && detailLoanId === loanId && !detail,
    [detail, detailLoanId, detailStatus, loanId],
  )

  const detailLoading = useMemo(() => {
    if (!loanId) return false
    if (detail) return false
    if (detailLoadFailed) return false
    return true
  }, [loanId, detail, detailLoadFailed])

  const showActionFeedback = Boolean(loanId && actionLoanId === loanId && actionPhase !== 'idle')

  if (!loanId) {
    return <Navigate to={ADMIN_LOAN_MONITORING_LIST_PATH} replace />
  }

  return (
    <AdminPageFrame>
      <DashboardRequestFeedbackLayer
        phase={detailLoading ? 'loading' : 'idle'}
        loadingTitle="Loading loan details"
        loadingDescription="Fetching loan monitoring details…"
        errorTitle="Unable to load loan details"
        onDismiss={() => {}}
        onCancelLoading={() => {}}
      />

      {showActionFeedback ? (
        <PrivilegedActionFeedbackLayer
          phase={actionPhase}
          resolvedOutcome={
            actionStatus === 'succeeded' ? resolvedActionOutcome : null
          }
          loadingTitle={actionLabels.loadingTitle}
          loadingDescription={actionLabels.loadingDescription}
          errorTitle={actionLabels.errorTitle}
          errorDescription={actionError ?? undefined}
          directSuccessTitle={actionLabels.directSuccessTitle}
          onDismiss={handleDismissActionFeedback}
          onRetry={handleRetryAction}
          onCancelLoading={cancelPending}
        />
      ) : null}

      {detail ? (
        <AdminLoanMonitoringDetailView
          detail={detail}
          onBack={handleBack}
          onApprove={handleApprove}
          onReject={handleReject}
          onApproveFunding={handleApproveFunding}
          onMarkDefaulted={handleMarkDefaulted}
          onWriteOffShortfall={handleWriteOffShortfall}
          actionLoading={actionLoading}
          actionKind={actionKind}
        />
      ) : !detailLoading ? (
        <div className="w-full max-w-[1280px] mx-auto pb-10">
          <button
            type="button"
            onClick={handleBack}
            aria-label="Go back"
            className="h-10 w-10 rounded-[8px] flex items-center justify-center text-[#4D5D80] hover:bg-black/5"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </div>
      ) : null}
    </AdminPageFrame>
  )
}

export default AdminLoanMonitoringDetailPage
