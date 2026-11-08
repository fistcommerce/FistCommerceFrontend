import { parseAdminWriteResponse, type AdminWriteOutcome } from '@/api/adminActionResponse'
import { apiUrl, parseJsonResponse } from '@/api/client'
import { fetchWithAuthRecovery } from '@/api/authorizedFetch'
import { isStellarTestnetPreferred } from '@/contract_config/networkCapabilities'

/** UI tab filter for `GET /api/loan/admin/loans/monitoring/`. */
export type AdminLoanMonitoringTabFilter =
  | 'all'
  | 'active'
  | 'late'
  | 'under_review'
  | 'repaid'
  | 'defaulted'
  | 'rejected'

export type AdminLoanMonitoringStatus =
  | 'active'
  | 'late'
  | 'under_review'
  | 'repaid'
  | 'defaulted'
  | 'rejected'

export type AdminLoanMonitoringMerchant = {
  displayName: string
  wallet: string
}

export type AdminLoanMonitoringNextPayment = {
  label: string | null
  tone: string
  dueDate: string | null
}

export type AdminLoanMonitoringRow = {
  loanId: string
  receivableName: string
  merchant: AdminLoanMonitoringMerchant
  amount: string
  apr: number | null
  /** Risk-tier max tenor in days when available from the monitoring list. */
  loanDurationDays: number | null
  status: AdminLoanMonitoringStatus
  statusLabel: string
  nextPayment: AdminLoanMonitoringNextPayment
  /** Present when the monitoring list includes admin/detail hints per row. */
  receivableId?: string | null
  canFund?: boolean
  canInitiatePayout?: boolean
  isPaidOut?: boolean
  loanLifecycleStatus?: string
}

export type AdminLoanMonitoringCounts = {
  activeLoans: number
  latePaymentsAmount: string
  defaultedLoansAmount: string
  fullyRepaid: number
}

export type AdminLoanMonitoringListResult = {
  counts: AdminLoanMonitoringCounts
  results: AdminLoanMonitoringRow[]
  total: number
}

export type AdminLoanMonitoringBasicInformation = {
  fullName: string | null
  businessName: string | null
  industry: string | null
  yearsInOperation: number | null
}

export type AdminLoanMonitoringUploadedDocument = {
  name: string
  url: string | null
  hash: string | null
}

export type AdminLoanMonitoringDefaultManagement = {
  title: string
  description: string
  canMarkDefaulted: boolean
  buttonLabel: string
}

export type AdminLoanMonitoringDetailPayload = {
  monitoring: AdminLoanMonitoringRow
  basicInformation: AdminLoanMonitoringBasicInformation
  uploadedDocuments: AdminLoanMonitoringUploadedDocument[]
  defaultManagement: AdminLoanMonitoringDefaultManagement
  details: Record<string, unknown>
  admin: AdminLoanMonitoringAdminMeta
}

export type AdminLoanMonitoringAdminMeta = {
  uiStatus: string
  canApprove: boolean
  canReject: boolean
  canFund: boolean
  canInitiatePayout: boolean
  canCancelFunding: boolean
  canMarkDefaulted: boolean
  canWriteOffShortfall: boolean
  actions: string[]
}

const MONITORING_LIST_PATH = '/loan/admin/loans/monitoring/'

function authHeaders(accessToken: string | null | undefined): HeadersInit {
  const t = typeof accessToken === 'string' ? accessToken.trim() : ''
  if (!t) throw new Error('Missing access token for admin loan monitoring API request.')
  const header = /^Token\s+\S+/i.test(t) ? t : `Token ${t}`
  return {
    Accept: 'application/json',
    Authorization: header,
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function pickStr(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = record[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

function pickNullableStr(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = record[key]
    if (v === null) return null
    if (typeof v === 'string') return v.trim() || null
  }
  return null
}

function pickNumber(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const v = record[key]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v)
      if (Number.isFinite(n)) return n
    }
  }
  return null
}

function pickBool(record: Record<string, unknown>, ...keys: string[]): boolean {
  for (const key of keys) {
    const v = record[key]
    if (typeof v === 'boolean') return v
  }
  return false
}

function loanLifecycleFundingRank(status: string): number {
  switch (status.trim().toLowerCase()) {
    case 'created':
      return 1
    case 'verified':
      return 2
    case 'funded':
    case 'approved':
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

function normalizeMonitoringStatus(raw: string): AdminLoanMonitoringStatus {
  const t = raw.trim().toLowerCase()
  if (t === 'active') return 'active'
  if (t === 'late') return 'late'
  if (t === 'under_review' || t === 'under review') return 'under_review'
  if (t === 'repaid') return 'repaid'
  if (t === 'defaulted') return 'defaulted'
  if (t === 'rejected') return 'rejected'
  return 'active'
}

function normalizeMerchant(raw: unknown): AdminLoanMonitoringMerchant {
  const r = asRecord(raw)
  const wallet = pickStr(r, 'wallet')
  return {
    displayName: pickStr(r, 'displayName', 'display_name') || wallet,
    wallet,
  }
}

function normalizeNextPayment(raw: unknown): AdminLoanMonitoringNextPayment {
  const r = asRecord(raw)
  return {
    label: pickNullableStr(r, 'label'),
    tone: pickStr(r, 'tone') || 'neutral',
    dueDate: pickNullableStr(r, 'dueDate', 'due_date'),
  }
}

export function normalizeLoanMonitoringRow(raw: unknown): AdminLoanMonitoringRow | null {
  const r = asRecord(raw)
  const loanId = pickStr(r, 'loanId', 'loan_id')
  if (!loanId) return null
  const status = normalizeMonitoringStatus(pickStr(r, 'status'))
  const details = asRecord(r.details)
  const lifecycle = asRecord(details.lifecycle)
  const receivable = asRecord(details.receivable)
  const admin = r.admin != null ? normalizeAdminMeta(r.admin) : null
  const receivableId =
    pickNullableStr(r, 'receivableId', 'receivable_id') ??
    pickNullableStr(receivable, 'receivableId', 'receivable_id')
  const loanLifecycleStatus =
    pickStr(lifecycle, 'status') || pickStr(r, 'loanLifecycleStatus', 'loan_lifecycle_status') || undefined
  const lifecycleNorm = loanLifecycleStatus?.trim().toLowerCase() ?? ''
  const fundingApprovalDone = loanLifecycleFundingRank(lifecycleNorm) >= loanLifecycleFundingRank('funded')
  const canFund = admin?.canFund ?? pickBool(r, 'canFund', 'can_fund')
  const isPaidOut =
    pickBool(r, 'isPaidOut', 'is_paid_out', 'paidOut', 'paid_out') ||
    lifecycleNorm === 'paid_out' ||
    // Stellar Track A: DB "funded" already means disbursed.
    (isStellarTestnetPreferred() && lifecycleNorm === 'funded')
  // Stellar has no separate payout step after fund_receivable.
  const canInitiatePayout = isStellarTestnetPreferred()
    ? false
    : Boolean(receivableId?.trim() && fundingApprovalDone && !isPaidOut)

  return {
    loanId,
    receivableName: pickStr(r, 'receivableName', 'receivable_name') || 'Receivable',
    merchant: normalizeMerchant(r.merchant),
    amount: pickStr(r, 'amount') || '0.00',
    apr: pickNumber(r, 'apr'),
    loanDurationDays: pickNumber(r, 'loanDurationDays', 'loan_duration_days'),
    status,
    statusLabel:
      pickStr(r, 'statusLabel', 'status_label') ||
      status.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    nextPayment: normalizeNextPayment(r.nextPayment ?? r.next_payment),
    receivableId,
    canFund,
    canInitiatePayout,
    isPaidOut,
    ...(loanLifecycleStatus ? { loanLifecycleStatus } : {}),
  }
}

function normalizeMonitoringCounts(raw: unknown): AdminLoanMonitoringCounts {
  const r = asRecord(raw)
  return {
    activeLoans: pickNumber(r, 'activeLoans', 'active_loans') ?? 0,
    latePaymentsAmount: pickStr(r, 'latePaymentsAmount', 'late_payments_amount') || '0.00',
    defaultedLoansAmount: pickStr(r, 'defaultedLoansAmount', 'defaulted_loans_amount') || '0.00',
    fullyRepaid: pickNumber(r, 'fullyRepaid', 'fully_repaid') ?? 0,
  }
}

function normalizeAdminMeta(raw: unknown): AdminLoanMonitoringAdminMeta {
  const r = asRecord(raw)
  const actions: string[] = []
  if (Array.isArray(r.actions)) {
    for (const item of r.actions) {
      if (typeof item === 'string' && item.trim()) actions.push(item.trim())
    }
  }
  const canWriteOffShortfall =
    pickBool(r, 'canWriteOffShortfall', 'can_write_off_shortfall') ||
    actions.some((a) => {
      const normalized = a.toLowerCase().replace(/-/g, '_')
      return normalized === 'write_off_shortfall' || normalized === 'write_off'
    })
  const canInitiatePayout =
    pickBool(r, 'canInitiatePayout', 'can_initiate_payout', 'canPayout', 'can_payout') ||
    actions.some((a) => {
      const normalized = a.toLowerCase().replace(/-/g, '_')
      return normalized === 'initiate_payout' || normalized === 'payout' || normalized === 'fund_payout'
    })
  const canCancelFunding =
    pickBool(r, 'canCancelFunding', 'can_cancel_funding') ||
    actions.some((a) => {
      const normalized = a.toLowerCase().replace(/-/g, '_')
      return normalized === 'cancel_funding' || normalized === 'cancelfunding'
    })
  return {
    uiStatus: pickStr(r, 'uiStatus', 'ui_status'),
    canApprove: pickBool(r, 'canApprove', 'can_approve'),
    canReject: pickBool(r, 'canReject', 'can_reject'),
    canFund: pickBool(r, 'canFund', 'can_fund'),
    canInitiatePayout,
    canCancelFunding,
    canMarkDefaulted: pickBool(r, 'canMarkDefaulted', 'can_mark_defaulted'),
    canWriteOffShortfall,
    actions,
  }
}

function normalizeDefaultManagement(raw: unknown): AdminLoanMonitoringDefaultManagement {
  const r = asRecord(raw)
  return {
    title: pickStr(r, 'title') || 'Loan Default',
    description:
      pickStr(r, 'description') ||
      'Mark this loan as defaulted when repayment is overdue or unrecoverable.',
    canMarkDefaulted: pickBool(r, 'canMarkDefaulted', 'can_mark_defaulted'),
    buttonLabel: pickStr(r, 'buttonLabel', 'button_label') || 'Mark as defaulted',
  }
}

function normalizeMonitoringListResponse(raw: unknown): AdminLoanMonitoringListResult {
  const r = asRecord(raw)
  const results: AdminLoanMonitoringRow[] = []
  if (Array.isArray(r.results)) {
    for (const item of r.results) {
      const row = normalizeLoanMonitoringRow(item)
      if (row) results.push(row)
    }
  }
  return {
    counts: normalizeMonitoringCounts(r.counts),
    results,
    total: pickNumber(r, 'total', 'count') ?? results.length,
  }
}

function normalizeBasicInformation(raw: unknown): AdminLoanMonitoringBasicInformation {
  const r = asRecord(raw)
  return {
    fullName: pickNullableStr(r, 'fullName', 'full_name'),
    businessName: pickNullableStr(r, 'businessName', 'business_name'),
    industry: pickNullableStr(r, 'industry'),
    yearsInOperation: pickNumber(r, 'yearsInOperation', 'years_in_operation'),
  }
}

function normalizeUploadedDocuments(raw: unknown): AdminLoanMonitoringUploadedDocument[] {
  if (!Array.isArray(raw)) return []
  const docs: AdminLoanMonitoringUploadedDocument[] = []
  for (const item of raw) {
    const r = asRecord(item)
    const name = pickStr(r, 'name') || 'Loan Verification File'
    docs.push({
      name,
      url: pickNullableStr(r, 'url'),
      hash: pickNullableStr(r, 'hash'),
    })
  }
  return docs
}

function normalizeMonitoringDetailResponse(raw: unknown): AdminLoanMonitoringDetailPayload | null {
  const r = asRecord(raw)
  const monitoring = normalizeLoanMonitoringRow(r.monitoring)
  if (!monitoring) return null
  const details = asRecord(r.details)
  const basicRaw = r.basicInformation ?? r.basic_information
  const docsRaw = r.uploadedDocuments ?? r.uploaded_documents
  const merchant = asRecord(details.merchant)

  const basicInformation =
    basicRaw != null && Object.keys(asRecord(basicRaw)).length > 0
      ? normalizeBasicInformation(basicRaw)
      : normalizeBasicInformation({
          fullName: merchant.fullName ?? merchant.full_name,
          businessName: merchant.businessName ?? merchant.business_name,
          industry: merchant.industry,
          yearsInOperation: merchant.yearsOfOperation ?? merchant.years_of_operation,
        })

  let uploadedDocuments = normalizeUploadedDocuments(docsRaw)
  if (uploadedDocuments.length === 0) {
    const receivable = asRecord(details.receivable)
    const summary = asRecord(details.summary)
    const url =
      pickNullableStr(receivable, 'verificationDocumentUrl', 'verification_document_url') ||
      pickNullableStr(summary, 'verificationDocumentUrl', 'verification_document_url')
    const hash =
      pickNullableStr(receivable, 'verificationDocHash', 'verification_doc_hash') ||
      pickNullableStr(summary, 'verificationDocHash', 'verification_doc_hash')
    if (url || hash) {
      uploadedDocuments = [
        {
          name: 'Loan Verification File',
          url,
          hash,
        },
      ]
    }
  }

  const admin = normalizeAdminMeta(r.admin)
  const defaultManagement = normalizeDefaultManagement(
    r.defaultManagement ?? r.default_management,
  )
  const lifecycleStatus = pickStr(asRecord(details.lifecycle), 'status').trim().toLowerCase()
  const receivableId =
    pickNullableStr(asRecord(asRecord(details.receivable)), 'receivableId', 'receivable_id') ??
    null
  const canMarkDefaulted =
    lifecycleStatus === 'funded' && Boolean(receivableId?.trim())
  defaultManagement.canMarkDefaulted = canMarkDefaulted
  admin.canMarkDefaulted = canMarkDefaulted

  return {
    monitoring,
    basicInformation,
    uploadedDocuments,
    defaultManagement,
    details,
    admin,
  }
}

export type FetchAdminLoanMonitoringParams = {
  status?: AdminLoanMonitoringTabFilter
  search?: string
  limit?: number
  offset?: number
}

/** `GET /api/loan/admin/loans/monitoring/` — summary counts + filtered loan rows. */
export async function fetchAdminLoanMonitoringList(
  accessToken: string | null | undefined,
  params?: FetchAdminLoanMonitoringParams,
): Promise<AdminLoanMonitoringListResult> {
  const q = new URLSearchParams()
  q.set('status', params?.status ?? 'all')
  const search = params?.search?.trim()
  if (search) q.set('search', search)
  q.set('limit', String(params?.limit ?? 50))
  q.set('offset', String(params?.offset ?? 0))

  const url = `${apiUrl(MONITORING_LIST_PATH)}?${q.toString()}`
  const res = await fetchWithAuthRecovery(url, {
    method: 'GET',
    headers: authHeaders(accessToken),
  })
  const raw = await parseJsonResponse<unknown>(res)
  return normalizeMonitoringListResponse(raw)
}

/** `GET /api/loan/admin/loans/{loanId}/` — loan monitoring detail. */
export async function fetchAdminLoanMonitoringDetail(
  accessToken: string | null | undefined,
  loanId: string,
): Promise<AdminLoanMonitoringDetailPayload> {
  const id = loanId.trim()
  if (!id) throw new Error('Missing loan id.')

  const url = apiUrl(`/loan/admin/loans/${encodeURIComponent(id)}/`)
  const res = await fetchWithAuthRecovery(url, {
    method: 'GET',
    headers: authHeaders(accessToken),
  })
  const raw = await parseJsonResponse<unknown>(res)
  const detail = normalizeMonitoringDetailResponse(raw)
  if (!detail) {
    throw new Error('Loan monitoring detail response was missing required fields.')
  }
  return detail
}

export type AdminLoanReviewStatus = 'verified' | 'rejected'

/** `POST /api/loan/admin/review` — approve (`verified`) or reject (`rejected`) a loan. */
export async function postAdminLoanReview(
  accessToken: string | null | undefined,
  params: { loanId: string; status: AdminLoanReviewStatus },
  options?: { signal?: AbortSignal },
): Promise<AdminWriteOutcome> {
  const loanId = params.loanId.trim()
  if (!loanId) throw new Error('Missing loan id.')

  const res = await fetchWithAuthRecovery(apiUrl('/loan/admin/review'), {
    method: 'POST',
    headers: {
      ...authHeaders(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      loan_id: loanId,
      status: params.status,
    }),
    signal: options?.signal,
  })
  return parseAdminWriteResponse(res)
}

/** `POST /api/loan/admin/loans/{loanId}/default/` — mark a funded loan as defaulted. */
export async function postAdminMarkLoanDefaulted(
  accessToken: string | null | undefined,
  loanId: string,
  options?: { lossAmountWei?: number; signal?: AbortSignal },
): Promise<AdminWriteOutcome> {
  const id = loanId.trim()
  if (!id) throw new Error('Missing loan id.')

  const body: Record<string, number> = {}
  if (options?.lossAmountWei != null && Number.isFinite(options.lossAmountWei)) {
    body.loss_amount_wei = options.lossAmountWei
  }

  const res = await fetchWithAuthRecovery(apiUrl(`/loan/admin/loans/${encodeURIComponent(id)}/default/`), {
    method: 'POST',
    headers: {
      ...authHeaders(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: options?.signal,
  })
  return parseAdminWriteResponse(res)
}

/** `POST /api/loan/admin/loans/{loanId}/write-off-shortfall/` */
export async function postAdminWriteOffLoanShortfall(
  accessToken: string | null | undefined,
  loanId: string,
  options?: { signal?: AbortSignal },
): Promise<AdminWriteOutcome> {
  const id = loanId.trim()
  if (!id) throw new Error('Missing loan id.')

  const res = await fetchWithAuthRecovery(
    apiUrl(`/loan/admin/loans/${encodeURIComponent(id)}/write-off-shortfall/`),
    {
      method: 'POST',
      headers: authHeaders(accessToken),
      signal: options?.signal,
    },
  )
  return parseAdminWriteResponse(res)
}

/** `POST /api/loan/admin/fund` — funding approval: allocate pool capital for a verified receivable. */
export async function postAdminFundLoan(
  accessToken: string | null | undefined,
  receivableId: string,
  options?: { signal?: AbortSignal },
): Promise<AdminWriteOutcome> {
  const id = receivableId.trim()
  if (!id) throw new Error('Missing receivable id.')

  const res = await fetchWithAuthRecovery(apiUrl('/loan/admin/fund'), {
    method: 'POST',
    headers: {
      ...authHeaders(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ receivable_id: id }),
    signal: options?.signal,
  })
  return parseAdminWriteResponse(res)
}
