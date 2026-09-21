import { ApiRequestError, parseJsonResponse, requireApiBaseUrl } from '@/api/client'
import { fetchWithAuthRecovery } from '@/api/authorizedFetch'
import { pinataGatewayUrl } from '@/lib/pinataGateway'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function pickStr(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return null
}

function pickFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

function pickId(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return null
}

function pickStrArray(record: Record<string, unknown>, ...keys: string[]): string[] {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return [value.trim()]
    if (!Array.isArray(value)) continue
    const urls = value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    if (urls.length) return urls.map((item) => item.trim())
  }
  return []
}

/** Resolve gateway URL from explicit URL, IPFS CID/hash, or merchant document list. */
export function resolveVerificationDocumentUrl(
  explicitUrl: string | null,
  docHash: string | null,
  documentUrls: string[],
): string | null {
  for (const candidate of [explicitUrl, ...documentUrls]) {
    const trimmed = candidate?.trim()
    if (trimmed) return trimmed
  }
  const hash = docHash?.trim()
  if (!hash) return null
  return pinataGatewayUrl(hash)
}

export type LoanDetailsSummary = {
  title: string | null
  riskTierId: number
  /** Flat tenor rate % of principal (legacy field name; same as tenorRatePercent). */
  apr: number | null
  tenorRatePercent?: number | null
  totalAmount: string | null
  funding: string | null
  amountOwed: string | null
  verificationDocHash: string | null
  verificationDocumentUrl: string | null
}

export type LoanDetailsLifecycle = {
  status: string
  createdAt: string | null
  verifiedAt: string | null
  maturedAt: string | null
  defaultedAt: string | null
  repaidAt: string | null
  onchainStatus: number | null
}

export type LoanDetailsRepaymentProgress = {
  daysRemaining: number | null
  label: string | null
}

export type LoanDetailsRepaymentDetails = {
  repaymentDueDate: string | null
  loanDurationDays: number | null
  repaymentStructure: string
  progress: LoanDetailsRepaymentProgress
}

export type LoanDetailsMerchant = {
  fullName: string | null
  businessName: string | null
  industry: string | null
  yearsOfOperation: number | null
  receivableDocuments: string[]
}

export type LoanDetailsReceivable = {
  receivableId: string | null
  verificationDocHash: string | null
  verificationDocumentUrl: string | null
}

/** `GET /api/loan/details/<loan_id>/` — top-level `LoanDetailsSerializer` shape. */
export type LoanDetailsResponse = {
  /** `LoanRequest` pk / `request_id` from list or details payload when present. */
  loanRequestId: string | null
  summary: LoanDetailsSummary
  lifecycle: LoanDetailsLifecycle
  repaymentDetails: LoanDetailsRepaymentDetails
  merchant: LoanDetailsMerchant
  receivable: LoanDetailsReceivable
}

const LOAN_REQUEST_ID_KEYS = [
  'id',
  'request_id',
  'requestId',
  'loan_id',
  'loanId',
  'pk',
  'uuid',
  'loan_request_uuid',
  'loanRequestUuid',
  'loan_request_id',
  'loanRequestId',
] as const

const LOAN_REQUEST_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isLoanRequestUuid(id: string): boolean {
  return LOAN_REQUEST_ID_UUID_RE.test(id.trim())
}

function findUuidInRecord(record: Record<string, unknown>): string | null {
  for (const value of Object.values(record)) {
    if (typeof value === 'string' && isLoanRequestUuid(value)) return value.trim()
  }
  return null
}

function pickLoanRequestIdFromRecord(record: Record<string, unknown>): string | null {
  const explicit = pickId(record, ...LOAN_REQUEST_ID_KEYS)
  if (explicit) return explicit
  return findUuidInRecord(record)
}

/** Extract loan request id from a list or details JSON object (before/after normalize). */
export function pickLoanRequestIdFromRaw(raw: unknown): string | null {
  const root = asRecord(raw)
  const direct = pickLoanRequestIdFromRecord(root)
  if (direct) return direct

  const nested = asRecord(root.loan_request ?? root.loanRequest)
  const nestedId = pickLoanRequestIdFromRecord(nested)
  if (nestedId) return nestedId

  for (const key of [
    'summary',
    'lifecycle',
    'receivable',
    'merchant',
    'repaymentDetails',
    'repayment_details',
  ] as const) {
    const sectionId = pickLoanRequestIdFromRecord(asRecord(root[key]))
    if (sectionId) return sectionId
  }

  const title = pickStr(asRecord(root.summary), 'title')
  if (title && isLoanRequestUuid(title)) return title

  return findUuidInRecord(root)
}

export function resolveLoanRequestId(raw: unknown, details: LoanDetailsResponse): string | null {
  return details.loanRequestId ?? pickLoanRequestIdFromRaw(raw)
}

/** Row is backed by a real loan request id (not a client-only placeholder key). */
export function canNavigateToLoanDetail(id: string): boolean {
  const value = id.trim()
  return Boolean(value) && !value.startsWith('pending-')
}

/** Repayment requires merchant disbursement (`paid_out`) or an active post-payout loan state. */
export function isLoanLifecycleEligibleForRepayment(statusRaw: string | null | undefined): boolean {
  const s = (statusRaw ?? '').trim().toLowerCase()
  if (!s || s === 'repaid') return false
  return s === 'paid_out' || s === 'matured' || s === 'defaulted'
}

export type MerchantLoanListEntry = {
  /** Id for list keys and navigation; equals `loanRequestId` when the API provides one. */
  loanId: string
  loanRequestId: string | null
  details: LoanDetailsResponse
}

function normalizeLoanDetailsPayload(raw: unknown): LoanDetailsResponse {
  const root = asRecord(raw)
  const loanRequestId = pickLoanRequestIdFromRaw(raw)
  const summary = asRecord(root.summary)
  const lifecycle = asRecord(root.lifecycle)
  const repaymentDetails = asRecord(root.repaymentDetails ?? root.repayment_details)
  const progress = asRecord(repaymentDetails.progress)
  const merchant = asRecord(root.merchant)
  const receivable = asRecord(root.receivable)

  const merchantDocuments = pickStrArray(merchant, 'receivableDocuments', 'receivable_documents')
  const summaryUrl = pickStr(summary, 'verificationDocumentUrl', 'verification_document_url')
  const summaryHash = pickStr(summary, 'verificationDocHash', 'verification_doc_hash')
  const receivableUrl = pickStr(receivable, 'verificationDocumentUrl', 'verification_document_url')
  const receivableHash = pickStr(receivable, 'verificationDocHash', 'verification_doc_hash')
  const verificationDocumentUrl = resolveVerificationDocumentUrl(
    summaryUrl ?? receivableUrl,
    summaryHash ?? receivableHash,
    merchantDocuments,
  )

  return {
    loanRequestId,
    summary: {
      title: pickStr(summary, 'title'),
      riskTierId: Number(summary.riskTierId ?? summary.risk_tier_id ?? 0),
      apr:
        pickFiniteNumber(summary.tenorRatePercent) ?? pickFiniteNumber(summary.apr),
      tenorRatePercent:
        pickFiniteNumber(summary.tenorRatePercent) ?? pickFiniteNumber(summary.apr),
      totalAmount: pickStr(summary, 'totalAmount', 'total_amount'),
      funding: pickStr(summary, 'funding'),
      amountOwed: pickStr(summary, 'amountOwed', 'amount_owed'),
      verificationDocHash: summaryHash,
      verificationDocumentUrl,
    },
    lifecycle: {
      status: pickStr(lifecycle, 'status') ?? '',
      createdAt: pickStr(lifecycle, 'createdAt', 'created_at'),
      verifiedAt: pickStr(lifecycle, 'verifiedAt', 'verified_at'),
      maturedAt: pickStr(lifecycle, 'maturedAt', 'matured_at'),
      defaultedAt: pickStr(lifecycle, 'defaultedAt', 'defaulted_at'),
      repaidAt: pickStr(lifecycle, 'repaidAt', 'repaid_at'),
      onchainStatus:
        typeof lifecycle.onchainStatus === 'number'
          ? lifecycle.onchainStatus
          : typeof lifecycle.onchain_status === 'number'
            ? lifecycle.onchain_status
            : null,
    },
    repaymentDetails: {
      repaymentDueDate: pickStr(repaymentDetails, 'repaymentDueDate', 'repayment_due_date'),
      loanDurationDays:
        typeof repaymentDetails.loanDurationDays === 'number'
          ? repaymentDetails.loanDurationDays
          : typeof repaymentDetails.loan_duration_days === 'number'
            ? repaymentDetails.loan_duration_days
            : null,
      repaymentStructure:
        pickStr(repaymentDetails, 'repaymentStructure', 'repayment_structure') ?? '',
      progress: {
        daysRemaining:
          typeof progress.daysRemaining === 'number'
            ? progress.daysRemaining
            : typeof progress.days_remaining === 'number'
              ? progress.days_remaining
              : null,
        label: pickStr(progress, 'label'),
      },
    },
    merchant: {
      fullName: pickStr(merchant, 'fullName', 'full_name'),
      businessName: pickStr(merchant, 'businessName', 'business_name'),
      industry: pickStr(merchant, 'industry'),
      yearsOfOperation:
        typeof merchant.yearsOfOperation === 'number'
          ? merchant.yearsOfOperation
          : typeof merchant.years_of_operation === 'number'
            ? merchant.years_of_operation
            : null,
      receivableDocuments: merchantDocuments,
    },
    receivable: {
      receivableId: pickStr(receivable, 'receivableId', 'receivable_id'),
      verificationDocHash: receivableHash,
      verificationDocumentUrl: receivableUrl ?? verificationDocumentUrl,
    },
  }
}

function authHeaders(accessToken: string): HeadersInit {
  const t = accessToken.trim()
  return {
    Accept: 'application/json',
    Authorization: /^Token\s+\S+/i.test(t) ? t : `Token ${t}`,
  }
}

/**
 * `GET /api/loan/details/<loan_id>/` — use `request_id` from `POST /api/loan/request` as `loan_id`.
 */
export async function fetchLoanDetails(
  accessToken: string,
  loanId: string,
): Promise<LoanDetailsResponse> {
  const id = loanId.trim()
  if (!id) {
    throw new ApiRequestError('Loan id is required.', 400)
  }
  const base = requireApiBaseUrl()
  const res = await fetchWithAuthRecovery(`${base}/api/loan/details/${encodeURIComponent(id)}/`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  })
  const raw = await parseJsonResponse<unknown>(res)
  return normalizeLoanDetailsPayload(raw)
}

/** `GET /api/loan/request` — array of loan detail objects, or legacy `{ loans: [...] }`. */
function parseMerchantLoanListPayload(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  const wrapped = asRecord(data).loans
  return Array.isArray(wrapped) ? wrapped : []
}

/**
 * `GET /api/loan/request` — `[{ id, summary, lifecycle, ... }]` (LoanDetailsSerializer per item).
 */
export async function fetchMerchantLoanList(
  accessToken: string | null | undefined,
): Promise<MerchantLoanListEntry[]> {
  const token = accessToken?.trim()
  if (!token) {
    throw new ApiRequestError('Missing access token for authorized request.', 401)
  }
  const base = requireApiBaseUrl()
  const res = await fetchWithAuthRecovery(`${base}/api/loan/request`, {
    method: 'GET',
    headers: authHeaders(token),
  })
  const data = await parseJsonResponse<unknown>(res)
  const rawLoans = parseMerchantLoanListPayload(data)

  return rawLoans.map((item, index) => {
    const details = normalizeLoanDetailsPayload(item)
    const loanRequestId = details.loanRequestId ?? pickLoanRequestIdFromRaw(item)
    return {
      loanRequestId,
      loanId: loanRequestId ?? `pending-${index}`,
      details,
    }
  })
}
