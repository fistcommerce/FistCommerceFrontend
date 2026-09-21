import type {
  AdminLoanMonitoringDetailPayload,
  AdminLoanMonitoringNextPayment,
  AdminLoanMonitoringRow,
  AdminLoanMonitoringStatus,
} from '@/api/adminLoanMonitoring'
import type { ReceivablePayoutStatus } from '@/api/payout'
import { displayDashboardMetricString } from '@/api/metrics'
import type { AdminPillVariant } from '@/components/admin/primitives/types'
import type { ReceivableLifecycleStep } from '@/components/dashboard/merchant/receivables/receivableDetailTypes'
import { LOAN_VERIFICATION_FILE_LABEL } from '@/components/dashboard/merchant/receivables/receivableDetailTypes'
import type { LoanMonitoringDetailView } from '@/components/admin/loan-monitoring/types'
import {
  lifecycleCompletedCount as receivableLifecycleCompletedCount,
  ReceivableStage,
} from '@/types/receivables'
import { resolveLoanRepaymentAmountLabels } from '@/utils/loanRepaymentAmounts'

export function formatAdminLoanMonitoringCount(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export function formatAdminLoanMonitoringMoney(amount: string): string {
  return displayDashboardMetricString(amount)
}

export function formatAdminLoanMonitoringApr(apr: number | null): string {
  if (apr == null || !Number.isFinite(apr)) return '—'
  return `${apr.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`
}

export function formatAdminLoanMonitoringDurationDays(days: number | null): string {
  if (days == null || !Number.isFinite(days)) return '—'
  const n = Math.max(0, Math.round(days))
  return `${n.toLocaleString('en-US')} day${n === 1 ? '' : 's'}`
}

export function adminLoanMonitoringStatusLabel(status: AdminLoanMonitoringStatus): string {
  switch (status) {
    case 'active':
      return 'Active'
    case 'late':
      return 'Late'
    case 'under_review':
      return 'Under Review'
    case 'repaid':
      return 'Repaid'
    case 'defaulted':
      return 'Defaulted'
    case 'rejected':
      return 'Rejected'
    default:
      return status
  }
}

export function loanMonitoringPillVariant(status: AdminLoanMonitoringStatus): AdminPillVariant {
  switch (status) {
    case 'active':
      return 'active'
    case 'late':
      return 'late'
    case 'under_review':
      return 'underReview'
    case 'repaid':
      return 'approved'
    case 'defaulted':
      return 'rejected'
    case 'rejected':
      return 'rejected'
    default:
      return 'neutral'
  }
}

export function nextPaymentIsOverdue(
  nextPayment: AdminLoanMonitoringNextPayment,
  status: AdminLoanMonitoringStatus,
): boolean {
  if (status === 'late' || status === 'defaulted') return true
  const tone = nextPayment.tone.trim().toLowerCase()
  return tone === 'danger' || tone === 'warning'
}

function formatFieldValue(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'string') {
    const t = value.trim()
    if (!t) return '—'
    if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
      const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (m) return `${m[3]}-${m[2]}-${m[1]}`
    }
    if (/^\d+(\.\d+)?$/.test(t)) return formatAdminLoanMonitoringMoney(t)
    return t
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 0 && value <= 100 && !Number.isInteger(value)) return `${value}%`
    if (Number.isInteger(value)) return value.toLocaleString('en-US')
    return formatAdminLoanMonitoringMoney(String(value))
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function pickString(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = record[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  }
  return null
}

function formatYearsOfOperation(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value >= 6 ? `${value}+ years` : `${value} years`
  }
  return formatFieldValue(value)
}

function buildBasicInfo(basicInformation: AdminLoanMonitoringDetailPayload['basicInformation']): {
  label: string
  value: string
}[] {
  return [
    {
      label: 'Full Name',
      value: formatFieldValue(basicInformation.fullName),
    },
    {
      label: 'Business Name',
      value: formatFieldValue(basicInformation.businessName),
    },
    {
      label: 'Industry',
      value: formatFieldValue(basicInformation.industry),
    },
    {
      label: 'Years in Operation',
      value: formatYearsOfOperation(basicInformation.yearsInOperation),
    },
  ]
}

function resolveUploadedDocument(
  documents: AdminLoanMonitoringDetailPayload['uploadedDocuments'],
): { name: string; url: string | null } {
  const first = documents[0]
  if (!first) {
    return { name: LOAN_VERIFICATION_FILE_LABEL, url: null }
  }
  return {
    name: first.name.trim() || LOAN_VERIFICATION_FILE_LABEL,
    url: first.url?.trim() || null,
  }
}

/** Lifecycle has reached `funded` or a later post-fund state. */
export function isLoanLifecycleFundedOrLater(loanStatus: string): boolean {
  return loanStatusRank(loanStatus) >= loanStatusRank('funded')
}

function loanStatusRank(status: string): number {
  switch (status.trim().toLowerCase()) {
    case 'created':
      return 1
    case 'verified':
      return 2
    case 'funded':
    case 'approved':
      // Admin UI maps both `funded` and early post-fund states to "approved".
      return 3
    case 'paid_out':
      return 4
    case 'matured':
      return 5
    case 'defaulted':
    case 'rejected':
      // Terminal states — a rejected funded loan is unwound on-chain, alongside defaulted.
      return 6
    case 'repaid':
      return 7
    default:
      return 0
  }
}

/**
 * Map on-chain lifecycle status → Receivable Lifecycle UI stage.
 * Kept separate from `loanStatusRank` (funding/payout gates).
 * `paid_out` stays on Funded — payout is not maturity.
 */
function adminLoanLifecycleStatusToStage(status: string): ReceivableStage {
  switch (status.trim().toLowerCase()) {
    case 'verified':
      return ReceivableStage.Verified
    case 'funded':
    case 'approved':
    case 'paid_out':
      return ReceivableStage.Funded
    case 'matured':
      return ReceivableStage.Matured
    case 'defaulted':
      return ReceivableStage.Defaulted
    case 'repaid':
      return ReceivableStage.Repaid
    case 'rejected':
      return ReceivableStage.Rejected
    default:
      return ReceivableStage.Created
  }
}

function lifecycleCompletedCountFromLoanStatus(status: string): number {
  return receivableLifecycleCompletedCount(adminLoanLifecycleStatusToStage(status))
}

function buildLifecycleSteps(lifecycle: Record<string, unknown>): ReceivableLifecycleStep[] {
  const status = (pickString(lifecycle, 'status') ?? 'created').trim().toLowerCase()
  const stage = adminLoanLifecycleStatusToStage(status)
  const createdAt = lifecycle.createdAt ?? lifecycle.created_at
  const verifiedAt = lifecycle.verifiedAt ?? lifecycle.verified_at
  const maturedAt = lifecycle.maturedAt ?? lifecycle.matured_at
  const defaultedAt = lifecycle.defaultedAt ?? lifecycle.defaulted_at
  const repaidAt = lifecycle.repaidAt ?? lifecycle.repaid_at

  const fundedDate =
    stage === ReceivableStage.Funded ||
    stage === ReceivableStage.Matured ||
    stage === ReceivableStage.Defaulted ||
    stage === ReceivableStage.Repaid
      ? verifiedAt ?? maturedAt
      : null
  const defaultedDate = stage === ReceivableStage.Defaulted ? defaultedAt ?? maturedAt : null
  const repaidDate = stage === ReceivableStage.Repaid ? repaidAt ?? maturedAt : null

  return [
    {
      label: 'Receivable Created',
      description:
        'Your receivable has been successfully created. Please be patient while we verify your information.',
      date: formatFieldValue(createdAt),
      variant: 'blue',
    },
    {
      label: 'Receivable Verified',
      description: 'Your receivable has been verified and approved for funding on the lending pool.',
      date: formatFieldValue(verifiedAt),
      variant: 'purple',
    },
    {
      label: 'Receivable Funded',
      description:
        'Capital has been allocated from the lending pool. Disbursement to the merchant wallet is a separate funding payout step.',
      date: formatFieldValue(fundedDate),
      variant: 'green',
    },
    {
      label: 'Loan Matured',
      description: 'Your receivable has reached maturity and repayment is now due.',
      date: formatFieldValue(maturedAt),
      variant: 'sky',
    },
    {
      label: 'Loan Defaulted',
      description:
        'This loan has been marked as defaulted due to missed repayment or other risk events.',
      date: formatFieldValue(defaultedDate),
      variant: 'red',
    },
    {
      label: 'Loan Repaid',
      description: 'Your loan has been repaid in full and the receivable is closed.',
      date: formatFieldValue(repaidDate),
      variant: 'neutral',
    },
  ]
}

function buildRepaymentRows(
  repaymentDetails: Record<string, unknown>,
  summary: Record<string, unknown>,
  monitoring: AdminLoanMonitoringDetailPayload['monitoring'],
): { label: string; value: string }[] {
  const durationRaw = repaymentDetails.loanDurationDays ?? repaymentDetails.loan_duration_days
  const durationValue =
    durationRaw == null || durationRaw === ''
      ? '—'
      : typeof durationRaw === 'number'
        ? `${durationRaw} Days`
        : /days/i.test(String(durationRaw))
          ? formatFieldValue(durationRaw)
          : `${formatFieldValue(durationRaw)} Days`

  const repaymentAmounts = resolveLoanRepaymentAmountLabels({
    funding: pickString(summary, 'funding'),
    totalAmount:
      pickString(summary, 'totalAmount', 'total_amount') ??
      (monitoring.amount.trim() ? monitoring.amount : null),
    amountOwed: pickString(summary, 'amountOwed', 'amount_owed'),
  })

  return [
    {
      label: 'Repayment due date',
      value: formatFieldValue(
        repaymentDetails.repaymentDueDate ?? repaymentDetails.repayment_due_date,
      ),
    },
    { label: 'Loan Duration', value: durationValue },
    {
      label: 'Repayment Structure',
      value: formatFieldValue(
        repaymentDetails.repaymentStructure ?? repaymentDetails.repayment_structure ?? 'Bullet',
      ),
    },
    { label: 'Amount repaid', value: repaymentAmounts.amountRepaid },
    { label: 'Amount left', value: repaymentAmounts.amountLeft },
    { label: 'Grace Period', value: 'N/A' },
    { label: 'Late Payment Penalty', value: '0.6% APR per month' },
  ]
}

function resolveMaturityBanner(
  repaymentDetails: Record<string, unknown>,
  monitoring: AdminLoanMonitoringDetailPayload['monitoring'],
): string {
  const progress = asObj(repaymentDetails.progress)
  const progressLabel = pickString(progress, 'label')
  if (progressLabel) return progressLabel

  const nextPayment = monitoring.nextPayment.label?.trim()
  if (nextPayment) return nextPayment

  const daysRemaining = progress.daysRemaining ?? progress.days_remaining
  if (typeof daysRemaining === 'number' && Number.isFinite(daysRemaining)) {
    return `Loan Maturing in ${daysRemaining} Days`
  }

  return '—'
}

function verificationDocumentName(name: string, url: string | null): string {
  if (name.trim() && name.trim() !== LOAN_VERIFICATION_FILE_LABEL) return name.trim()
  if (!url) return LOAN_VERIFICATION_FILE_LABEL
  try {
    const pathname = new URL(url).pathname
    const segment = pathname.split('/').filter(Boolean).pop()
    if (segment) return decodeURIComponent(segment)
  } catch {
    // fall through
  }
  return LOAN_VERIFICATION_FILE_LABEL
}

/** Enabled only after the loan is verified, funded, and not yet repaid/defaulted. */
function resolveCanMarkDefaulted(loanStatus: string, receivableId: string | null): boolean {
  const status = loanStatus.trim().toLowerCase()
  if (status !== 'funded') return false
  return Boolean(receivableId?.trim())
}

/** Show funding approval UI once the loan is verified or has progressed further. */
export function shouldShowFundingApprovalSection(loanLifecycleStatus: string): boolean {
  return loanStatusRank(loanLifecycleStatus) >= loanStatusRank('verified')
}

export type MapAdminLoanMonitoringDetailOptions = {
  payoutStatus?: ReceivablePayoutStatus | null
}

function resolveFundingApprovalDone(loanStatus: string): boolean {
  return isLoanLifecycleFundedOrLater(loanStatus)
}

function resolveIsPaidOut(
  loanStatusNorm: string,
  lifecycle: Record<string, unknown>,
  payoutStatus?: ReceivablePayoutStatus | null,
): boolean {
  if (payoutStatus != null) return payoutStatus.isPaidOut
  if (loanStatusNorm === 'paid_out') return true
  return pickBool(lifecycle, 'is_paid_out', 'isPaidOut')
}

export function mapAdminLoanMonitoringDetailToView(
  payload: AdminLoanMonitoringDetailPayload,
  options?: MapAdminLoanMonitoringDetailOptions,
): LoanMonitoringDetailView {
  const { monitoring, basicInformation, uploadedDocuments, defaultManagement, details } = payload
  const lifecycle = asObj(details.lifecycle)
  const repaymentDetails = asObj(details.repaymentDetails ?? details.repayment_details)
  const summary = asObj(details.summary)

  const document = resolveUploadedDocument(uploadedDocuments)
  const loanStatus = pickString(lifecycle, 'status') ?? 'created'
  const loanStatusNorm = loanStatus.trim().toLowerCase()
  const receivable = asObj(details.receivable)
  const receivableId = pickString(receivable, 'receivableId', 'receivable_id') || null
  const canMarkDefaulted = resolveCanMarkDefaulted(loanStatus, receivableId)

  const isPaidOut = resolveIsPaidOut(loanStatusNorm, lifecycle, options?.payoutStatus)
  const fundingApprovalDone = resolveFundingApprovalDone(loanStatus)
  const canApproveFunding =
    payload.admin.canFund && Boolean(receivableId) && loanStatusNorm === 'verified'
  const canInitiatePayout = Boolean(receivableId && fundingApprovalDone && !isPaidOut)

  return {
    loanId: monitoring.loanId,
    receivableName: monitoring.receivableName,
    receivableId,
    loanLifecycleStatus: loanStatus,
    fundingApprovalDone,
    isPaidOut,
    showFundingApprovalSection: shouldShowFundingApprovalSection(loanStatus),
    showFundingPayoutSection: fundingApprovalDone,
    canApproveFunding,
    canInitiatePayout,
    basicInfo: buildBasicInfo(basicInformation),
    documentName: verificationDocumentName(document.name, document.url),
    documentUrl: document.url,
    lifecycle: buildLifecycleSteps(lifecycle),
    lifecycleStage: adminLoanLifecycleStatusToStage(loanStatus),
    lifecycleCompletedCount: lifecycleCompletedCountFromLoanStatus(loanStatus),
    repaymentRows: buildRepaymentRows(repaymentDetails, summary, monitoring),
    maturityBanner: resolveMaturityBanner(repaymentDetails, monitoring),
    defaultManagement: {
      ...defaultManagement,
      canMarkDefaulted,
    },
    admin: {
      canApprove: payload.admin.canApprove,
      canReject: payload.admin.canReject,
      canFund: payload.admin.canFund,
      canInitiatePayout: payload.admin.canInitiatePayout,
      // Lifecycle only (same gate as release funds): enabled while funded and not yet paid out.
      canCancelFunding: Boolean(receivableId) && fundingApprovalDone && !isPaidOut,
      canMarkDefaulted,
      canWriteOffShortfall: payload.admin.canWriteOffShortfall,
      uiStatus: payload.admin.uiStatus,
    },
  }
}

function pickBool(record: Record<string, unknown>, ...keys: string[]): boolean {
  for (const key of keys) {
    const v = record[key]
    if (typeof v === 'boolean') return v
  }
  return false
}

function asObj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export type { AdminLoanMonitoringRow }
