import { displayDashboardMetricString } from '@/api/metrics'
import { resolveVerificationDocumentUrl, type LoanDetailsResponse } from '@/api/loanDetails'
import { getReceivableDetailById } from '@/components/dashboard/merchant/receivables/receivableDetailConfig'
import {
  LOAN_VERIFICATION_FILE_LABEL,
  type ReceivableDetailView,
} from '@/components/dashboard/merchant/receivables/receivableDetailTypes'
import type { ReceivableTableRow } from '@/components/dashboard/merchant/receivables/types'
import type { MerchantLoanTableRowData } from '@/components/dashboard/merchant/lending-pool-detail/types'
import { ReceivableStage } from '@/types/receivables'
import { parseMoneyToHuman } from '@/utils/mapLoanDetailsToRepayReviewView'
import { resolveLoanRepaymentAmountLabels } from '@/utils/loanRepaymentAmounts'
import { isLoanFullyRepaid, type MerchantReceivableRepayState } from '@/utils/merchantReceivableRepayEligibility'

function formatIsoDateForDisplay(iso: string | null | undefined): string {
  if (!iso?.trim()) return '—'
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return iso.trim()
}

function formatMoneyDisplay(raw: string | null | undefined): string {
  if (!raw?.trim()) return '—'
  const formatted = displayDashboardMetricString(raw)
  return formatted === '—' ? raw.trim() : formatted
}

function formatPercentRate(
  rate: number | null | undefined,
  suffix: 'tenor' | 'APY',
): string | undefined {
  if (rate == null || !Number.isFinite(rate)) return suffix === 'tenor' ? '—' : undefined
  if (suffix === 'tenor') {
    return `${rate.toLocaleString('en-US', { maximumFractionDigits: 2 })}% for tenor`
  }
  return `${rate.toLocaleString('en-US', { maximumFractionDigits: 2 })}% ${suffix}`
}

function shortWalletLabel(value: string): string {
  const v = value.trim()
  if (!v) return '—'
  if (v.length <= 14) return v
  return `${v.slice(0, 6)}...${v.slice(-4)}`
}

function loanDisplayTitle(loanId: string, api: LoanDetailsResponse): string {
  return (
    api.merchant.businessName?.trim() ||
    api.merchant.fullName?.trim() ||
    api.summary.title?.trim() ||
    `Receivable ${loanId.slice(0, 8)}`
  )
}

function apiStatusToStage(statusRaw: string | null | undefined): ReceivableStage {
  const s = (statusRaw ?? '').trim().toLowerCase()
  if (s === 'verified') return ReceivableStage.Verified
  if (s === 'funded') return ReceivableStage.Funded
  if (s === 'paid_out' || s === 'matured') return ReceivableStage.Matured
  if (s === 'defaulted') return ReceivableStage.Defaulted
  if (s === 'repaid') return ReceivableStage.Repaid
  if (s === 'rejected') return ReceivableStage.Rejected
  return ReceivableStage.Created
}

function resolveReceivableStage(api: LoanDetailsResponse): ReceivableStage {
  if (isLoanFullyRepaid(api)) return ReceivableStage.Repaid
  return apiStatusToStage(api.lifecycle.status)
}

function statusToDebtStatus(api: LoanDetailsResponse): {
  debtStatus: string
  debtStatusVariant: ReceivableTableRow['debtStatusVariant']
} {
  if (isLoanFullyRepaid(api)) {
    return { debtStatus: 'Repaid', debtStatusVariant: 'repaid' }
  }
  const s = (api.lifecycle.status ?? '').trim().toLowerCase()
  if (s === 'repaid') return { debtStatus: 'Repaid', debtStatusVariant: 'repaid' }
  if (s === 'rejected') return { debtStatus: 'Rejected', debtStatusVariant: 'rejected' }
  if (s === 'defaulted') return { debtStatus: 'Defaulted', debtStatusVariant: 'defaulted' }
  if (s === 'funded' || s === 'verified') return { debtStatus: 'Unpaid', debtStatusVariant: 'unpaid' }
  if (s === 'paid_out') return { debtStatus: 'Unpaid', debtStatusVariant: 'unpaid' }
  return { debtStatus: 'Unpaid', debtStatusVariant: 'unpaid' }
}

function repaymentDueVariantFromStatus(
  api: LoanDetailsResponse,
  daysRemaining: number | null | undefined,
): ReceivableTableRow['repaymentDueVariant'] {
  if (isLoanFullyRepaid(api)) return 'repaid'
  const s = (api.lifecycle.status ?? '').trim().toLowerCase()
  if (s === 'repaid') return 'repaid'
  if (s === 'defaulted') return 'overdue'
  if (daysRemaining != null && daysRemaining <= 0 && s !== 'repaid') return 'overdue'
  return 'upcoming'
}

/** Map `LoanDetailsSerializer` list/detail payload to receivables table row. */
export function mapLoanDetailsToReceivableTableRow(
  loanId: string,
  api: LoanDetailsResponse,
): ReceivableTableRow {
  const debt = statusToDebtStatus(api)
  const title = loanDisplayTitle(loanId, api)
  const totalDisplay = formatMoneyDisplay(api.summary.totalAmount)
  const owedDisplay = formatMoneyDisplay(api.summary.amountOwed)
  const aprDisplay = formatPercentRate(api.summary.apr, 'tenor') ?? '—'
  const durationDisplay =
    api.repaymentDetails.loanDurationDays != null
      ? `${api.repaymentDetails.loanDurationDays} day${
          api.repaymentDetails.loanDurationDays === 1 ? '' : 's'
        }`
      : undefined

  return {
    id: loanId,
    receivableName: title,
    loanAmount: totalDisplay,
    apr: aprDisplay,
    loanDuration: durationDisplay,
    repaymentDue: formatIsoDateForDisplay(api.repaymentDetails.repaymentDueDate),
    repaymentDueVariant: repaymentDueVariantFromStatus(
      api,
      api.repaymentDetails.progress.daysRemaining,
    ),
    repaymentAmount: owedDisplay,
    interestSubline: aprDisplay !== '—' ? aprDisplay : '',
    debtStatus: debt.debtStatus,
    debtStatusVariant: debt.debtStatusVariant,
    rowEmphasis: debt.debtStatusVariant === 'defaulted',
  }
}

/** Map `LoanDetailsSerializer` list payload to merchant lending-pool loans table row. */
export function mapLoanDetailsToMerchantLoanTableRow(
  loanId: string,
  api: LoanDetailsResponse,
): MerchantLoanTableRowData {
  const row = mapLoanDetailsToReceivableTableRow(loanId, api)
  const repaymentAmountRaw = api.summary.amountOwed?.trim() || api.summary.funding?.trim() || null

  return {
    id: row.id,
    merchantName: row.receivableName,
    walletShort: shortWalletLabel(api.receivable.receivableId ?? ''),
    loanAmount: row.loanAmount,
    issueDate: formatIsoDateForDisplay(api.lifecycle.createdAt),
    repaymentDue: row.repaymentDue,
    repaymentAmount: formatMoneyDisplay(repaymentAmountRaw),
    repaymentApy: formatPercentRate(api.summary.apr, 'APY'),
    debtStatus: row.debtStatus,
  }
}

function mergeLifecycle(
  api: LoanDetailsResponse,
  fallback: ReceivableDetailView,
  stage: ReceivableStage,
): ReceivableDetailView['lifecycle'] {
  const status = api.lifecycle.status?.trim().toLowerCase() ?? ''
  const fundedAt =
    status === 'funded' ||
    status === 'paid_out' ||
    status === 'matured' ||
    status === 'defaulted' ||
    status === 'repaid'
      ? api.lifecycle.verifiedAt ?? api.lifecycle.maturedAt
      : null
  const dates = [
    api.lifecycle.createdAt,
    api.lifecycle.verifiedAt,
    fundedAt,
    api.lifecycle.maturedAt,
    status === 'defaulted' ? api.lifecycle.defaultedAt ?? api.lifecycle.maturedAt : null,
    stage === ReceivableStage.Repaid
      ? api.lifecycle.repaidAt ?? api.lifecycle.maturedAt
      : null,
  ]
  return fallback.lifecycle.map((step, i) => ({
    ...step,
    date: formatIsoDateForDisplay(dates[i]),
  }))
}

function mergeRepaymentRows(
  api: LoanDetailsResponse,
  fallback: ReceivableDetailView,
): ReceivableDetailView['repaymentRows'] {
  const byLabel = new Map(fallback.repaymentRows.map((r) => [r.label.toLowerCase(), r]))
  const get = (label: string, apiVal: string | null | undefined) => {
    const fb = byLabel.get(label.toLowerCase())
    const formatted = label.toLowerCase().includes('date')
      ? formatIsoDateForDisplay(apiVal)
      : apiVal?.trim() || '—'
    return { label: fb?.label ?? label, value: formatted }
  }

  const repaymentAmounts = resolveLoanRepaymentAmountLabels({
    funding: api.summary.funding,
    totalAmount: api.summary.totalAmount,
    amountOwed: api.summary.amountOwed,
  })

  return [
    get('Repayment due date', api.repaymentDetails.repaymentDueDate),
    get(
      'Loan Duration',
      api.repaymentDetails.loanDurationDays != null
        ? `${api.repaymentDetails.loanDurationDays} Days`
        : null,
    ),
    get('Repayment Structure', api.repaymentDetails.repaymentStructure),
    { label: 'Amount repaid', value: repaymentAmounts.amountRepaid },
    { label: 'Amount left', value: repaymentAmounts.amountLeft },
    byLabel.get('grace period') ?? { label: 'Grace Period', value: 'N/A' },
    byLabel.get('late payment penalty') ?? {
      label: 'Late Payment Penalty',
      value: '0.6% APR per month',
    },
  ]
}

function mergeBasicInfo(
  api: LoanDetailsResponse,
  fallback: ReceivableDetailView,
): ReceivableDetailView['basicInfo'] {
  const map = new Map(fallback.basicInfo.map((f) => [f.label.toLowerCase(), f]))
  const field = (label: string, apiVal: string | number | null | undefined) => {
    const fb = map.get(label.toLowerCase())
    if (apiVal == null || (typeof apiVal === 'string' && !apiVal.trim())) {
      return { label: fb?.label ?? label, value: '—' }
    }
    return { label: fb?.label ?? label, value: String(apiVal) }
  }

  return [
    field('Full Name', api.merchant.fullName),
    field('Business Name', api.merchant.businessName),
    field('Industry', api.merchant.industry),
    field('Years in Operation', api.merchant.yearsOfOperation),
  ]
}

/** Map live loan details onto the receivable detail layout. Missing API fields stay `—`. */
export function mapLoanDetailsToReceivableDetailView(
  loanId: string,
  api: LoanDetailsResponse,
  repayState?: MerchantReceivableRepayState,
): ReceivableDetailView {
  const fallback =
    getReceivableDetailById(loanId) ?? getReceivableDetailById('r-1') ?? getReceivableDetailById('r-2')

  if (!fallback) {
    throw new Error('Missing receivable detail fallback configuration.')
  }

  const stage = resolveReceivableStage(api)
  const debt = statusToDebtStatus(api)
  const title = loanDisplayTitle(loanId, api)

  const totalDisplay = formatMoneyDisplay(api.summary.totalAmount)
  const fundingDisplay = formatMoneyDisplay(api.summary.funding)
  const owedDisplay = formatMoneyDisplay(api.summary.amountOwed)
  const aprDisplay = formatPercentRate(api.summary.apr, 'tenor') ?? '—'

  const verificationDocumentUrl =
    api.summary.verificationDocumentUrl?.trim() ||
    api.receivable.verificationDocumentUrl?.trim() ||
    resolveVerificationDocumentUrl(
      null,
      api.summary.verificationDocHash ?? api.receivable.verificationDocHash,
      api.merchant.receivableDocuments,
    )

  const row: ReceivableTableRow = {
    ...mapLoanDetailsToReceivableTableRow(loanId, api),
    receivableName: title,
    loanAmount: totalDisplay,
    apr: aprDisplay,
    repaymentAmount: owedDisplay,
    interestSubline: aprDisplay !== '—' ? aprDisplay : '',
    debtStatus: debt.debtStatus,
    debtStatusVariant: debt.debtStatusVariant,
    rowEmphasis: debt.debtStatusVariant === 'defaulted',
  }

  const heroMetrics = fallback.heroMetrics.map((m) => {
    if (m.id === 'total') {
      return {
        ...m,
        primaryValue: totalDisplay,
        secondaryValue: api.summary.totalAmount?.trim()
          ? `${api.summary.totalAmount.trim()} USDT`
          : '—',
      }
    }
    if (m.id === 'funding') {
      return {
        ...m,
        primaryValue: fundingDisplay,
        secondaryValue: api.summary.funding?.trim()
          ? `${api.summary.funding.trim()} USDT`
          : '—',
      }
    }
    if (m.id === 'owed') {
      return {
        ...m,
        primaryValue: owedDisplay,
        secondaryValue: aprDisplay,
      }
    }
    return m
  })

  const progressLabel = api.repaymentDetails.progress.label?.trim() || ''

  return {
    ...fallback,
    row,
    stage,
    subtitle: fallback.subtitle,
    heroMetrics,
    lifecycle: mergeLifecycle(api, fallback, stage),
    repaymentRows: mergeRepaymentRows(api, fallback),
    maturityBanner:
      stage === ReceivableStage.Rejected
        ? 'Application rejected'
        : stage === ReceivableStage.Repaid
          ? 'Loan repaid in full'
          : progressLabel || '—',
    basicInfo: mergeBasicInfo(api, fallback),
    documentName: verificationDocumentUrl ? LOAN_VERIFICATION_FILE_LABEL : '—',
    documentUrl: verificationDocumentUrl,
    repayState:
      repayState ??
      ({
        isPaidOutToMerchant: false,
        canRepay: false,
        disabledReason: 'Repayment is available after loan funds have been disbursed to you.',
        amountOwedHuman: parseMoneyToHuman(api.summary.amountOwed),
      } satisfies MerchantReceivableRepayState),
  }
}
