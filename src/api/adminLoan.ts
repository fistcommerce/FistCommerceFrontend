import { parseJsonResponse, requireApiBaseUrl } from '@/api/client'
import { fetchWithAuthRecovery } from '@/api/authorizedFetch'

/** UI tab filter sent as `status` query param to `GET /api/loan/admin/receivables/`. */
export type AdminReceivablesTabFilter = 'all' | 'pending' | 'under_review' | 'approved' | 'rejected'

/** Row status from admin receivables list API. */
export type AdminReceivableListStatus = 'pending' | 'under_review' | 'approved' | 'rejected'

export type AdminReceivableDocumentLink = {
  label: string
  url: string
}

export type AdminReceivableListRow = {
  loanId: string
  merchant: {
    wallet: string
    displayName: string
    businessName: string | null
  }
  receivable: {
    receivableId: string | null
    title: string
  }
  loanAmount: string
  periodDays: number | null
  documents: AdminReceivableDocumentLink[]
  status: AdminReceivableListStatus
}

export type AdminReceivablesCounts = {
  pending: number
  underReview: number
  approved: number
  rejected: number
}

export type AdminReceivablesListResult = {
  counts: AdminReceivablesCounts
  results: AdminReceivableListRow[]
  total: number
}

type AdminReceivablesListResponseApi = Record<string, unknown>

function authHeaders(accessToken: string | null | undefined): HeadersInit {
  const t = typeof accessToken === 'string' ? accessToken.trim() : ''
  if (!t) throw new Error('Missing access token for admin loan API request.')
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
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
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

function normalizeListStatus(raw: string): AdminReceivableListStatus | null {
  const t = raw.trim().toLowerCase()
  if (t === 'pending') return 'pending'
  if (t === 'under_review' || t === 'under review') return 'under_review'
  if (t === 'approved' || t === 'verified') return 'approved'
  if (t === 'rejected') return 'rejected'
  return null
}

function normalizeDocuments(raw: unknown): AdminReceivableDocumentLink[] {
  if (!Array.isArray(raw)) return []
  const out: AdminReceivableDocumentLink[] = []
  for (const item of raw) {
    const r = asRecord(item)
    const url = pickStr(r, 'url')
    if (!url) continue
    out.push({
      label: pickStr(r, 'label') || 'View Documents',
      url,
    })
  }
  return out
}

function normalizeReceivableListRow(raw: unknown): AdminReceivableListRow | null {
  const r = asRecord(raw)
  const loanId = pickStr(r, 'loanId', 'loan_id')
  if (!loanId) return null
  const merchantRaw = asRecord(r.merchant)
  const receivableRaw = asRecord(r.receivable)
  const status = normalizeListStatus(pickStr(r, 'status'))
  if (!status) return null
  return {
    loanId,
    merchant: {
      wallet: pickStr(merchantRaw, 'wallet'),
      displayName: pickStr(merchantRaw, 'displayName', 'display_name') || pickStr(merchantRaw, 'wallet'),
      businessName: pickNullableStr(merchantRaw, 'businessName', 'business_name'),
    },
    receivable: {
      receivableId: pickNullableStr(receivableRaw, 'receivableId', 'receivable_id'),
      title: pickStr(receivableRaw, 'title') || 'Receivable',
    },
    loanAmount: pickStr(r, 'loanAmount', 'loan_amount'),
    periodDays: pickNumber(r, 'periodDays', 'period_days'),
    documents: normalizeDocuments(r.documents),
    status,
  }
}

function normalizeReceivablesCounts(raw: unknown): AdminReceivablesCounts {
  const r = asRecord(raw)
  return {
    pending: pickNumber(r, 'pending') ?? 0,
    underReview: pickNumber(r, 'underReview', 'under_review') ?? 0,
    approved: pickNumber(r, 'approved') ?? 0,
    rejected: pickNumber(r, 'rejected') ?? 0,
  }
}

function normalizeAdminReceivablesListResponse(raw: unknown): AdminReceivablesListResult {
  const r = asRecord(raw)
  const results: AdminReceivableListRow[] = []
  if (Array.isArray(r.results)) {
    for (const item of r.results) {
      const row = normalizeReceivableListRow(item)
      if (row) results.push(row)
    }
  }
  return {
    counts: normalizeReceivablesCounts(r.counts),
    results,
    total: pickNumber(r, 'total', 'count') ?? results.length,
  }
}

export type FetchAdminReceivablesParams = {
  status?: AdminReceivablesTabFilter
  search?: string
  limit?: number
  offset?: number
}

/** `GET /api/loan/admin/receivables/` — tab counts + filtered receivables list. */
export async function fetchAdminReceivablesList(
  accessToken: string | null | undefined,
  params?: FetchAdminReceivablesParams,
): Promise<AdminReceivablesListResult> {
  const base = requireApiBaseUrl()
  const q = new URLSearchParams()
  q.set('status', params?.status ?? 'all')
  const search = params?.search?.trim()
  if (search) q.set('search', search)
  q.set('limit', String(params?.limit ?? 50))
  q.set('offset', String(params?.offset ?? 0))

  const url = `${base}/api/loan/admin/receivables/?${q.toString()}`
  const res = await fetchWithAuthRecovery(url, {
    method: 'GET',
    headers: authHeaders(accessToken),
  })
  const raw = await parseJsonResponse<AdminReceivablesListResponseApi>(res)
  return normalizeAdminReceivablesListResponse(raw)
}

/** Row from `GET /api/loan/admin/latest-repayments/`. */
export type AdminRepaymentApi = {
  id: number
  receivable_id: string
  event_type: string
  receiver: string
  amount: string
  amount_eth?: string | null
  tx_hash: string
  block_number: number
  created_at: string
}

type AdminLatestRepaymentsResponse = {
  repayments?: AdminRepaymentApi[]
}

/** `GET /api/loan/admin/latest-repayments/` — indexed repayment events (admin only). */
export async function fetchAdminLatestRepayments(
  accessToken: string | null | undefined,
  options?: { limit?: number },
): Promise<AdminRepaymentApi[]> {
  const base = requireApiBaseUrl()
  const limit = options?.limit ?? 10
  const url = `${base}/api/loan/admin/latest-repayments/?limit=${encodeURIComponent(String(limit))}`
  const res = await fetchWithAuthRecovery(url, {
    method: 'GET',
    headers: authHeaders(accessToken),
  })
  const data = await parseJsonResponse<AdminLatestRepaymentsResponse>(res)
  return Array.isArray(data.repayments) ? data.repayments : []
}

export type AdminReceivableDetailResult = {
  loanId: string
  receivableId: string | null
  title: string
  merchant: {
    wallet: string
    displayName: string
    businessName: string | null
  }
  loanAmount: string
  periodDays: number | null
  status: AdminReceivableListStatus
  documents: AdminReceivableDocumentLink[]
  details: Record<string, unknown>
}

/** `GET /api/loan/admin/receivables/{loanId}/` */
export async function fetchAdminReceivableDetail(
  accessToken: string | null | undefined,
  loanId: string,
): Promise<AdminReceivableDetailResult> {
  const id = loanId.trim()
  if (!id) throw new Error('Missing receivable loan id.')

  const base = requireApiBaseUrl()
  const res = await fetchWithAuthRecovery(
    `${base}/api/loan/admin/receivables/${encodeURIComponent(id)}/`,
    {
      method: 'GET',
      headers: authHeaders(accessToken),
    },
  )
  const raw = await parseJsonResponse<unknown>(res)
  const r = asRecord(raw)
  const merchantRaw = asRecord(r.merchant)
  const receivableRaw = asRecord(r.receivable)

  const documents: AdminReceivableDocumentLink[] = []
  if (Array.isArray(r.documents)) {
    for (const item of r.documents) {
      const d = asRecord(item)
      const url = pickStr(d, 'url')
      const label = pickStr(d, 'label') || 'Document'
      if (url) documents.push({ label, url })
    }
  }

  return {
    loanId: pickStr(r, 'loanId', 'loan_id') || id,
    receivableId: pickNullableStr(receivableRaw, 'receivableId', 'receivable_id'),
    title: pickStr(receivableRaw, 'title') || pickStr(r, 'title') || 'Receivable',
    merchant: {
      wallet: pickStr(merchantRaw, 'wallet'),
      displayName: pickStr(merchantRaw, 'displayName', 'display_name') || '—',
      businessName: pickNullableStr(merchantRaw, 'businessName', 'business_name'),
    },
    loanAmount: pickStr(r, 'loanAmount', 'loan_amount') || '0.00',
    periodDays: pickNumber(r, 'periodDays', 'period_days'),
    status: normalizeListStatus(pickStr(r, 'status')) ?? 'pending',
    documents,
    details: asRecord(r.details),
  }
}
