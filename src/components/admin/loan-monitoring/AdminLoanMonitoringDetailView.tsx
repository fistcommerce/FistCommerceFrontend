import { useMemo, useState } from 'react'

import type { LifecycleStepVariant } from '@/components/dashboard/merchant/receivables/receivableDetailTypes'
import { isLifecycleStepCompleted } from '@/types/receivables'

import type { AdminLoanMonitoringActionKind, LoanMonitoringDetailView } from './types'

const lifecycleBarClass = (variant: LifecycleStepVariant): string => {
  if (variant === 'purple') return 'bg-[#9333EA]'
  if (variant === 'green') return 'bg-[#16A34A]'
  if (variant === 'sky') return 'bg-[#38BDF8]'
  if (variant === 'red') return 'bg-[#DC2626]'
  if (variant === 'neutral') return 'bg-[#1F2937]'
  return 'bg-[#195EBC]'
}

function actionButtonClass(enabled: boolean, variant: 'primary' | 'danger'): string {
  const base = 'w-full h-[44px] rounded-[4px] text-[14px] font-semibold transition-colors'
  if (!enabled) {
    return `${base} bg-[#E6E8EC] text-[#8B92A3] cursor-not-allowed`
  }
  if (variant === 'danger') {
    return `${base} bg-[#DC2626] text-white hover:bg-[#b91c1c]`
  }
  return `${base} bg-[#195EBC] text-white hover:bg-[#154a9a]`
}

function actionLabel(loading: boolean, kind: AdminLoanMonitoringActionKind | null, target: AdminLoanMonitoringActionKind, label: string): string {
  if (loading && kind === target) return 'Processing…'
  return label
}

type PayoutReadiness = {
  ready: boolean
  failures: { code: string; message: string }[]
} | null

type AdminLoanMonitoringDetailViewProps = {
  detail: LoanMonitoringDetailView
  onBack: () => void
  onApprove: () => void
  onReject: () => void
  onApproveFunding: () => void
  onCancelFunding: () => void
  onInitiatePayout: () => void
  onMarkDefaulted: () => void
  onWriteOffShortfall: () => void
  actionLoading: boolean
  actionKind: AdminLoanMonitoringActionKind | null
  payoutReadiness?: PayoutReadiness
}

export function AdminLoanMonitoringDetailView({
  detail,
  onBack,
  onApprove,
  onReject,
  onApproveFunding,
  onCancelFunding,
  onInitiatePayout,
  onMarkDefaulted,
  onWriteOffShortfall,
  actionLoading,
  actionKind,
  payoutReadiness = null,
}: AdminLoanMonitoringDetailViewProps) {
  const {
    receivableName,
    basicInfo,
    documentName,
    documentUrl,
    lifecycle,
    lifecycleStage,
    repaymentRows,
    maturityBanner,
    receivableId,
    admin,
    defaultManagement,
    showFundingApprovalSection,
    showFundingPayoutSection,
    fundingApprovalDone,
    isPaidOut,
    canApproveFunding,
  } = detail

  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const rejectReasons = useMemo(
    () => [
      {
        id: 'incomplete',
        title: 'Incomplete or Missing Documents',
        description: 'Some required documents (invoice, delivery proof, or PO) were not provided or are unclear.',
      },
      {
        id: 'mismatch',
        title: 'Invoice Details Mismatch',
        description: 'Information across documents (amount, dates, buyer name) does not match.',
      },
      {
        id: 'duplicate',
        title: 'Duplicate or Previously Financed Invoice',
        description: 'This receivable appears to have already been submitted or financed elsewhere.',
      },
      {
        id: 'criteria',
        title: 'Does Not Meet Funding Criteria',
        description: 'The receivable does not meet platform rules (amount too low/high, due date outside allowed range, etc.).',
      },
    ],
    [],
  )

  const canReject = admin.canReject && !actionLoading
  const canApprove = admin.canApprove && !actionLoading
  const canFundNow = canApproveFunding && !actionLoading
  const evidenceReady = payoutReadiness == null || payoutReadiness.ready
  const canPayoutNow =
    Boolean(receivableId?.trim()) &&
    fundingApprovalDone &&
    !isPaidOut &&
    !actionLoading &&
    evidenceReady
  // Cancel stays available until funds are released (does not require evidence checklist).
  const canCancelFundingNow =
    Boolean(receivableId?.trim()) && fundingApprovalDone && !isPaidOut && !actionLoading
  const showLoanAcceptance = admin.canApprove || admin.canReject
  const canMarkDefaulted =
    admin.canMarkDefaulted && defaultManagement.canMarkDefaulted && !actionLoading
  const canWriteOffShortfall = admin.canWriteOffShortfall && !actionLoading

  const handleConfirmReject = () => {
    setRejectOpen(false)
    setRejectReason('')
    onReject()
  }

  return (
    <div className="w-full max-w-[1280px] mx-auto pb-10 flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Go back"
          className="h-10 w-10 rounded-[8px] flex items-center justify-center text-[#4D5D80] hover:bg-black/5"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-[#0B1220] font-bold text-[18px] sm:text-[20px] leading-tight truncate">{receivableName}</h1>
      </div>

      <section className="rounded-[12px] border border-[#E6E8EC] bg-white p-6 lg:p-8 shadow-sm">
        <h2 className="text-[#0B1220] font-bold text-[18px] mb-6">Basic Information</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
          {basicInfo.map((field) => (
            <div key={field.label}>
              <p className="text-[#4D5D80] text-[14px] font-medium mb-2">{field.label}</p>
              <div className="rounded-[6px] border border-[#D0D7E3] bg-[#FAFBFC] px-4 py-3 min-h-[48px] flex items-center">
                <span className="text-[#195EBC] text-[15px] font-medium">{field.value}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[12px] border border-[#E6E8EC] bg-white p-6 lg:p-8 shadow-sm">
        <h2 className="text-[#0B1220] font-bold text-[18px] mb-5">Uploaded Documents</h2>
        <div className="rounded-[6px] border border-[#D0D7E3] bg-[#FAFBFC] px-4 py-3 min-h-[56px] flex items-center">
          {documentUrl ? (
            <a
              href={documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 text-left text-[#195EBC] text-[15px] font-medium hover:opacity-90"
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border border-[#CFE0FF] bg-[#E8EFFB]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-[#195EBC]" aria-hidden>
                  <path
                    d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinejoin="round"
                  />
                  <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="underline underline-offset-2 decoration-[#195EBC]">{documentName}</span>
            </a>
          ) : (
            <span className="inline-flex items-center gap-3 text-[#8B92A3] text-[15px] font-medium">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border border-[#E6E8EC] bg-[#F3F4F6]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-[#8B92A3]" aria-hidden>
                  <path
                    d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinejoin="round"
                  />
                  <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
                </svg>
              </span>
              {documentName}
            </span>
          )}
        </div>
      </section>

      {showLoanAcceptance ? (
        <section className="rounded-[12px] border border-[#E6E8EC] bg-white p-6 lg:p-8 shadow-sm">
          <h2 className="text-[#0B1220] font-bold text-[18px] mb-2">Loan Acceptance</h2>
          <p className="text-[#6B7488] text-[14px] mb-5">Review this loan request and approve or reject it for funding.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              disabled={!canReject}
              onClick={() => setRejectOpen(true)}
              className={actionButtonClass(canReject, 'danger')}
            >
              {actionLabel(actionLoading, actionKind, 'reject', 'Reject')}
            </button>
            <button
              type="button"
              disabled={!canApprove}
              onClick={onApprove}
              className={actionButtonClass(canApprove, 'primary')}
            >
              {actionLabel(actionLoading, actionKind, 'approve', 'Approve')}
            </button>
          </div>
        </section>
      ) : null}

      {showFundingApprovalSection ? (
        <section
          id="loan-funding-approval-section"
          className="rounded-[12px] border border-[#E6E8EC] bg-white p-6 lg:p-8 shadow-sm"
        >
          <h2 className="text-[#0B1220] font-bold text-[18px] mb-2">Funding approval</h2>
          <p className="text-[#6B7488] text-[14px] mb-5">
            Approve funding to allocate capital from the lending pool for this receivable. This does not
            send tokens to the merchant yet.
          </p>
          {fundingApprovalDone ? (
            <p className="text-[#16A34A] text-[14px] font-medium">
              {isPaidOut ? 'Funding approved' : 'Funded — payout pending'}
            </p>
          ) : (
            <button
              type="button"
              disabled={!canFundNow}
              onClick={onApproveFunding}
              className={actionButtonClass(canFundNow, 'primary')}
            >
              {actionLabel(actionLoading, actionKind, 'fund', 'Approve funding')}
            </button>
          )}
          {!fundingApprovalDone && !canFundNow ? (
            <p className="mt-3 text-[#8B92A3] text-[13px] leading-relaxed">
              Available after loan acceptance when the receivable is verified on-chain.
            </p>
          ) : null}
        </section>
      ) : null}

      {showFundingPayoutSection ? (
        <section
          id="loan-funding-payout-section"
          className="rounded-[12px] border border-[#E6E8EC] bg-white p-6 lg:p-8 shadow-sm"
        >
          <h2 className="text-[#0B1220] font-bold text-[18px] mb-2">Funding payout</h2>
          <p className="text-[#6B7488] text-[14px] mb-5">
            Release funds to the merchant wallet, or cancel funding to return capital to the pool.
          </p>
          {isPaidOut ? (
            <p className="text-[#16A34A] text-[14px] font-medium">Funds released to merchant</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                disabled={!canCancelFundingNow}
                onClick={onCancelFunding}
                className={actionButtonClass(canCancelFundingNow, 'danger')}
              >
                {actionLabel(actionLoading, actionKind, 'cancelFunding', 'Cancel funding')}
              </button>
              <button
                type="button"
                disabled={!canPayoutNow}
                onClick={onInitiatePayout}
                className={actionButtonClass(canPayoutNow, 'primary')}
              >
                {actionLabel(actionLoading, actionKind, 'initiatePayout', 'Release funds')}
              </button>
            </div>
          )}
          {!isPaidOut && payoutReadiness && !payoutReadiness.ready ? (
            <ul className="mt-3 list-disc pl-5 text-[#92400E] text-[13px] space-y-1">
              {payoutReadiness.failures.map((f) => (
                <li key={f.code}>{f.message}</li>
              ))}
            </ul>
          ) : null}
          {!isPaidOut && !canPayoutNow && !canCancelFundingNow ? (
            <p className="mt-3 text-[#8B92A3] text-[13px] leading-relaxed">
              {fundingApprovalDone
                ? 'Add the on-chain receivable id to manage payout.'
                : 'Complete funding approval first.'}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-[12px] border border-[#E6E8EC] bg-white p-6 lg:p-8 shadow-sm">
        <h2 className="text-[#0B1220] font-bold text-[18px] mb-2">{defaultManagement.title}</h2>
        <p className="text-[#6B7488] text-[14px] mb-5">{defaultManagement.description}</p>
        <button
          type="button"
          disabled={!canMarkDefaulted}
          onClick={onMarkDefaulted}
          className={actionButtonClass(canMarkDefaulted, 'danger')}
        >
          {actionLabel(
            actionLoading,
            actionKind,
            'markDefaulted',
            defaultManagement.buttonLabel,
          )}
        </button>
      </section>

      {admin.canWriteOffShortfall ? (
        <section className="rounded-[12px] border border-[#E6E8EC] bg-white p-6 lg:p-8 shadow-sm">
          <h2 className="text-[#0B1220] font-bold text-[18px] mb-2">Write-off shortfall</h2>
          <p className="text-[#6B7488] text-[14px] mb-5">
            Record an on-chain write-off for the remaining loan shortfall after default. This is a servicer
            operation and completes immediately when successful.
          </p>
          <button
            type="button"
            disabled={!canWriteOffShortfall}
            onClick={onWriteOffShortfall}
            className={actionButtonClass(canWriteOffShortfall, 'danger')}
          >
            {actionLabel(actionLoading, actionKind, 'writeOffShortfall', 'Write off shortfall')}
          </button>
        </section>
      ) : null}

      {rejectOpen ? (
        <div
          className="fixed inset-0 z-80 flex items-end justify-center px-4 py-4 sm:items-center sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-label="Reject loan"
        >
          <div className="absolute inset-0 bg-black/35" onClick={() => setRejectOpen(false)} aria-hidden />
          <div className="relative flex w-full max-w-[920px] max-h-[min(90dvh,800px)] flex-col overflow-hidden rounded-[10px] border border-[#E6E8EC] bg-white shadow-xl">
            <div className="flex shrink-0 items-center gap-4 border-b border-[#EDF0F4] px-4 py-4 sm:px-8 sm:py-6">
              <button
                type="button"
                onClick={() => setRejectOpen(false)}
                className="h-10 w-10 rounded-[8px] flex items-center justify-center text-[#4D5D80] hover:bg-black/5"
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <h3 className="text-[#0B1220] font-bold text-[18px] leading-tight">Reject Loan</h3>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-8 sm:py-8">
              <p className="text-[#6B7488] text-[14px] mb-6">Select a reason for rejecting this loan</p>

              <div className="rounded-[8px] border border-[#EEF0F4] overflow-hidden">
                {rejectReasons.map((r, idx) => {
                  const selected = rejectReason === r.id
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRejectReason(r.id)}
                      className={[
                        'w-full px-4 py-4 sm:px-6 sm:py-5 flex items-start justify-between gap-4 sm:gap-6 text-left bg-white hover:bg-[#F9FAFB] transition-colors',
                        idx > 0 ? 'border-t border-[#EEF0F4]' : '',
                      ].join(' ')}
                    >
                      <div className="min-w-0">
                        <p className="text-[#0B1220] text-[15px] font-semibold leading-snug">{r.title}</p>
                        <p className="text-[#6B7488] text-[14px] leading-relaxed mt-2">{r.description}</p>
                      </div>
                      <span
                        className={[
                          'h-6 w-6 rounded-[4px] border flex items-center justify-center shrink-0 mt-0.5',
                          selected ? 'bg-[#195EBC] border-[#195EBC]' : 'bg-white border-[#C9D1DE]',
                        ].join(' ')}
                        aria-hidden
                      >
                        {selected ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        ) : null}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="shrink-0 border-t border-[#EDF0F4] px-4 py-4 sm:px-8 sm:py-5">
              <button
                type="button"
                onClick={handleConfirmReject}
                className="w-full h-[50px] rounded-[4px] bg-[#DC2626] text-white text-[15px] font-semibold hover:bg-[#b91c1c] transition-colors disabled:opacity-50 disabled:hover:bg-[#DC2626]"
                disabled={!rejectReason}
              >
                Reject Loan
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-[12px] border border-[#E6E8EC] bg-white p-6 lg:p-8 shadow-sm">
          <h2 className="text-[#0B1220] font-bold text-[18px] mb-6">Receivable Lifecycle</h2>
          <ol className="m-0 p-0 list-none flex flex-col gap-8">
            {lifecycle.map((step, i) => {
              const completed = isLifecycleStepCompleted(lifecycleStage, i)
              return (
                <li key={`${step.label}-${i}`} className="flex gap-4 min-w-0">
                  <div
                    className={[
                      'w-1.5 shrink-0 rounded-full self-stretch',
                      completed ? lifecycleBarClass(step.variant) : 'bg-[#D0D7E3]',
                    ].join(' ')}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className={['font-bold text-[15px] leading-snug', completed ? 'text-[#0B1220]' : 'text-[#8B92A3]'].join(' ')}>
                      {step.label}
                    </p>
                    <p className={['text-[14px] leading-relaxed mt-2', completed ? 'text-[#6B7488]' : 'text-[#B0B7C4]'].join(' ')}>
                      {step.description}
                    </p>
                    <p className={['text-[13px] mt-3', completed ? 'text-[#8B92A3]' : 'text-[#C2C8D4]'].join(' ')}>
                      {step.date}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>

        <section className="rounded-[12px] border border-[#E6E8EC] bg-white p-6 lg:p-8 shadow-sm self-start">
          <h2 className="text-[#0B1220] font-bold text-[18px] mb-5">Repayment Details</h2>
          <ul className="flex flex-col gap-4 m-0 p-0 list-none">
            {repaymentRows.map((r) => (
              <li
                key={r.label}
                className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline gap-1 border-b border-[#F0F2F6] pb-4 last:border-0 last:pb-0"
              >
                <span className="text-[#6B7488] text-[14px] font-medium">{r.label}</span>
                <span className="text-[#0B1220] font-medium text-[14px] sm:text-right">{r.value}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-[8px] bg-[#828282] px-4 py-3 text-center">
            <p className="text-white text-[14px] font-medium">{maturityBanner}</p>
          </div>
        </section>
      </div>
    </div>
  )
}
