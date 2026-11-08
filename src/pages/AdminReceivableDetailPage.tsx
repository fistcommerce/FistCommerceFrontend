import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'

import {
  loanMonitoringPrivilegedActionLabels,
  PrivilegedActionFeedbackLayer,
  resolveAdminWriteOutcome,
} from '@/admin/governance'
import { toUserFacingError } from '@/api/client'
import { fetchAdminReceivableDetail, type AdminReceivableDetailResult } from '@/api/adminLoan'
import { adminLoanMonitoringDetailHref } from '@/components/admin/loan-monitoring'
import { AdminPageFrame, AdminPanel, AdminStatusPill } from '@/components/admin/primitives'
import { DashboardRequestFeedbackLayer } from '@/components/dashboard/shared/DashboardRequestFeedbackLayer'
import { useCancellableThunkDispatch } from '@/hooks/useCancellableThunkDispatch'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  clearAdminLoanMonitoringActionError,
  fundAdminLoanMonitoringLoan,
  initiateAdminLoanMonitoringPayout,
  refreshAdminLoanMonitoringDetail,
  selectLoanMonitoringDetail,
} from '@/store/slices/adminLoanMonitoringSlice'

const AdminReceivableDetailPage = () => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { dispatchCancellable, cancelPending } = useCancellableThunkDispatch()
  const { receivableId } = useParams<{ receivableId: string }>()
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const sessionKind = useAppSelector((s) => s.auth.sessionKind)
  const actionStatus = useAppSelector((s) => s.adminLoanMonitoring.actionStatus)
  const actionKind = useAppSelector((s) => s.adminLoanMonitoring.actionKind)
  const actionError = useAppSelector((s) => s.adminLoanMonitoring.actionError)
  const actionLoanId = useAppSelector((s) => s.adminLoanMonitoring.actionLoanId)
  const lastActionOutcome = useAppSelector((s) => s.adminLoanMonitoring.lastActionOutcome)

  const [detail, setDetail] = useState<AdminReceivableDetailResult | null>(null)
  const [phase, setPhase] = useState<'loading' | 'failed' | 'idle'>('loading')
  const [error, setError] = useState<string | null>(null)

  const loanId = detail?.loanId?.trim() ?? ''
  const monitoringDetail = useAppSelector((s) =>
    loanId ? selectLoanMonitoringDetail(s.adminLoanMonitoring, loanId) : null,
  )

  const loadDetail = useCallback(() => {
    if (!receivableId?.trim() || !accessToken?.trim() || sessionKind !== 'admin') return
    setPhase('loading')
    setError(null)
    void fetchAdminReceivableDetail(accessToken, receivableId)
      .then((data) => {
        setDetail(data)
        setPhase('idle')
      })
      .catch((e) => {
        setDetail(null)
        setError(toUserFacingError(e, 'Could not load receivable detail.'))
        setPhase('failed')
      })
  }, [receivableId, accessToken, sessionKind])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  useEffect(() => {
    if (!loanId || !accessToken?.trim() || sessionKind !== 'admin') return
    void dispatch(refreshAdminLoanMonitoringDetail({ loanId }))
  }, [dispatch, loanId, accessToken, sessionKind])

  const receivablesReturnTo = receivableId
    ? `/dashboard/admin/receivables/${encodeURIComponent(receivableId)}`
    : '/dashboard/admin/receivables'

  const loanMonitoringHref = loanId
    ? adminLoanMonitoringDetailHref(loanId, receivablesReturnTo)
    : '#'
  const fundingApprovalHref = loanId
    ? adminLoanMonitoringDetailHref(loanId, receivablesReturnTo, 'funding-approval')
    : '#'

  const canApproveFunding = Boolean(monitoringDetail?.canApproveFunding)
  const fundingApprovalDone = Boolean(monitoringDetail?.fundingApprovalDone)
  const isPaidOut = Boolean(monitoringDetail?.isPaidOut)
  const canReleaseFunds = Boolean(
    monitoringDetail?.receivableId?.trim() && fundingApprovalDone && !isPaidOut,
  )

  const actionLoading = actionStatus === 'loading'
  const actionPhase = actionStatus === 'idle' ? 'idle' : actionStatus
  const showActionFeedback = Boolean(loanId && actionLoanId === loanId && actionPhase !== 'idle')

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
    if (!loanId || !monitoringDetail?.receivableId) return
    if (actionKind === 'fund') {
      dispatchCancellable(
        fundAdminLoanMonitoringLoan({ loanId, receivableId: monitoringDetail.receivableId }),
      )
    } else if (actionKind === 'initiatePayout') {
      dispatchCancellable(
        initiateAdminLoanMonitoringPayout({ loanId, receivableId: monitoringDetail.receivableId }),
      )
    }
  }, [dispatchCancellable, loanId, actionKind, monitoringDetail?.receivableId])

  const handleApproveFunding = useCallback(() => {
    if (!loanId || !monitoringDetail?.receivableId || actionLoading) return
    dispatchCancellable(
      fundAdminLoanMonitoringLoan({ loanId, receivableId: monitoringDetail.receivableId }),
    )
  }, [dispatchCancellable, loanId, monitoringDetail?.receivableId, actionLoading])

  const handleInitiatePayout = useCallback(() => {
    if (!loanId || !monitoringDetail?.receivableId || actionLoading) return
    dispatchCancellable(
      initiateAdminLoanMonitoringPayout({ loanId, receivableId: monitoringDetail.receivableId }),
    )
  }, [dispatchCancellable, loanId, monitoringDetail?.receivableId, actionLoading])

  if (!receivableId) {
    return <Navigate to="/dashboard/admin/receivables" replace />
  }

  return (
    <AdminPageFrame>
      <DashboardRequestFeedbackLayer
        phase={phase}
        loadingTitle="Loading receivable details"
        loadingDescription="Fetching receivable and document information…"
        errorTitle="Unable to load receivable"
        errorDescription={error ?? undefined}
        onDismiss={() => navigate('/dashboard/admin/receivables')}
        onRetry={loadDetail}
        cancelLabel="Back to receivables"
      />

      {showActionFeedback ? (
        <PrivilegedActionFeedbackLayer
          phase={actionPhase}
          resolvedOutcome={actionStatus === 'succeeded' ? resolvedActionOutcome : null}
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
          <button
            type="button"
            onClick={() => navigate('/dashboard/admin/receivables')}
            className="text-[#195EBC] text-[14px] font-medium hover:underline w-fit"
          >
            ← Back to receivables
          </button>

          <AdminPanel>
            <div className="px-5 py-5 flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-[#0B1220] text-[20px] font-bold">{detail.title}</h2>
                  <p className="text-[#6B7488] text-[13px] mt-1 font-mono">{detail.loanId}</p>
                </div>
                <AdminStatusPill variant="underReview">{detail.status.replace('_', ' ')}</AdminStatusPill>
              </div>

              {monitoringDetail ? (
                <p className="text-[#6B7488] text-[13px]">
                  {isPaidOut
                    ? 'Funding disbursed to merchant.'
                    : fundingApprovalDone
                      ? monitoringDetail?.showFundingPayoutSection
                        ? 'Funded — payout pending (capital allocated, not yet sent to merchant).'
                        : 'Funding allocated; disbursement is recorded on-chain with fund.'
                      : 'Funding approval pending.'}
                </p>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[14px]">
                <div>
                  <p className="text-[#6B7488] text-[12px]">Merchant</p>
                  <p className="text-[#0B1220] font-medium mt-1">{detail.merchant.displayName}</p>
                  <p className="text-[#6B7488] text-[13px] font-mono mt-1">{detail.merchant.wallet}</p>
                </div>
                <div>
                  <p className="text-[#6B7488] text-[12px]">Loan amount</p>
                  <p className="text-[#0B1220] font-semibold mt-1">{detail.loanAmount}</p>
                  <p className="text-[#6B7488] text-[13px] mt-1">
                    Period: {detail.periodDays != null ? `${detail.periodDays} days` : '—'}
                  </p>
                </div>
              </div>

              {detail.documents.length > 0 ? (
                <div>
                  <p className="text-[#0B1220] font-semibold text-[15px] mb-2">Documents</p>
                  <ul className="space-y-2">
                    {detail.documents.map((doc) => (
                      <li key={doc.url}>
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#195EBC] text-[14px] hover:underline"
                        >
                          {doc.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3 pt-2">
                <Link
                  to={loanMonitoringHref}
                  className="h-10 px-5 inline-flex items-center rounded-[4px] border border-[#D0D7E3] bg-white text-[#374151] text-[14px] font-semibold hover:bg-[#F9FAFB]"
                >
                  Open in loan monitoring
                </Link>
                {canApproveFunding ? (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => void handleApproveFunding()}
                    className="h-10 px-5 inline-flex items-center rounded-[4px] bg-[#195EBC] text-white text-[14px] font-semibold hover:bg-[#154a9a] disabled:opacity-60"
                  >
                    {actionLoading && actionKind === 'fund' ? 'Approving…' : 'Approve funding'}
                  </button>
                ) : fundingApprovalDone && !isPaidOut ? (
                  <Link
                    to={fundingApprovalHref}
                    className="h-10 px-5 inline-flex items-center rounded-[4px] border border-[#D0D7E3] bg-white text-[#374151] text-[14px] font-semibold hover:bg-[#F9FAFB]"
                  >
                    View funding approval
                  </Link>
                ) : null}
                {canReleaseFunds ? (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => void handleInitiatePayout()}
                    className="h-10 px-5 inline-flex items-center rounded-[4px] bg-[#195EBC] text-white text-[14px] font-semibold hover:bg-[#154a9a] disabled:opacity-60"
                  >
                    {actionLoading && actionKind === 'initiatePayout'
                      ? 'Releasing…'
                      : 'Release funds'}
                  </button>
                ) : null}
              </div>
            </div>
          </AdminPanel>
        </>
      ) : null}
    </AdminPageFrame>
  )
}

export default AdminReceivableDetailPage
