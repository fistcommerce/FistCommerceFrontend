import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { fetchReceivableEvidence, type ReceivableEvidenceBundle } from '@/api/evidence'
import EvidenceBundlePanel from '@/components/evidence/EvidenceBundlePanel'
import {
  loanMonitoringPrivilegedActionLabels,
  PrivilegedActionFeedbackLayer,
  resolveAdminWriteOutcome,
} from '@/admin/governance'
import {
  ADMIN_LOAN_MONITORING_FUNDING_APPROVAL_FOCUS_VALUE,
  ADMIN_LOAN_MONITORING_FUNDING_PAYOUT_FOCUS_VALUE,
  ADMIN_LOAN_MONITORING_LIST_PATH,
  ADMIN_LOAN_MONITORING_PAYOUT_FOCUS_QUERY_KEY,
  ADMIN_LOAN_MONITORING_PAYOUT_FOCUS_VALUE,
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

  const [evidence, setEvidence] = useState<ReceivableEvidenceBundle | null>(null)
  useEffect(() => {
    if (!loanId?.trim() || !accessToken?.trim() || sessionKind !== 'admin') return
    let cancelled = false
    void fetchReceivableEvidence(accessToken, loanId)
      .then((data) => {
        if (!cancelled) setEvidence(data)
      })
      .catch(() => {
        if (!cancelled) setEvidence(null)
      })
    return () => {
      cancelled = true
    }
  }, [loanId, accessToken, sessionKind, detail?.loanLifecycleStatus])


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
    const targetId =
      focus === ADMIN_LOAN_MONITORING_FUNDING_APPROVAL_FOCUS_VALUE
        ? 'loan-funding-approval-section'
        : focus === ADMIN_LOAN_MONITORING_FUNDING_PAYOUT_FOCUS_VALUE ||
            focus === ADMIN_LOAN_MONITORING_PAYOUT_FOCUS_VALUE
          ? 'loan-funding-payout-section'
          : null
    if (!targetId) return
    const el = document.getElementById(targetId)
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

  const handleInitiatePayout = useCallback(() => {
    if (!loanId || !detail?.receivableId || actionLoading) return
    dispatchCancellable(
      initiateAdminLoanMonitoringPayout({ loanId, receivableId: detail.receivableId }),
    )
  }, [dispatchCancellable, loanId, detail?.receivableId, actionLoading])

  const handleCancelFunding = useCallback(() => {
    if (!loanId || !detail?.receivableId || actionLoading) return
    dispatchCancellable(
      cancelFundingAdminLoanMonitoringLoan({ loanId, receivableId: detail.receivableId }),
    )
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
        <>
          {evidence ? (
            <div className="w-full max-w-[1280px] mx-auto px-4 sm:px-6 pt-4">
              <EvidenceBundlePanel bundle={evidence} />
            </div>
          ) : null}
          <AdminLoanMonitoringDetailView
            detail={detail}
            onBack={handleBack}
            onApprove={handleApprove}
            onReject={handleReject}
            onApproveFunding={handleApproveFunding}
            onCancelFunding={handleCancelFunding}
            onInitiatePayout={handleInitiatePayout}
            onMarkDefaulted={handleMarkDefaulted}
            onWriteOffShortfall={handleWriteOffShortfall}
            actionLoading={actionLoading}
            actionKind={actionKind}
            payoutReadiness={evidence?.payoutReadiness ?? null}
          />
        </>
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
