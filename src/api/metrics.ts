import { fetchWithAuthRecovery } from '@/api/authorizedFetch'
import { parseJsonResponse, requireApiBaseUrl } from '@/api/client'
import { DASHBOARD_LIST_PAGE_SIZE } from '@/constants/listPagination'
import {
  normalizeDashboardTransactionsListResponse,
  type DashboardTransactionsListParams,
  type DashboardTransactionsListResult,
} from '@/utils/dashboardTransactionsList'

/** `GET /api/metrics/investor/` — monetary fields are pre-formatted strings from the API. */
export type InvestorMetrics = {
  total_deposited: string
  total_withdrawn: string
  current_position_value: string
  total_interest_earned: string
  share_of_pool: string
  netDeposited: string
  /** Percent points as returned by the API (e.g. `5.25` → 5.25%). */
  roi: number
}

/** Raw API payload for `GET /api/metrics/investor/` (may be snake_case, strings, or JSON numbers). */
export type InvestorMetricsApi = Record<string, unknown>

/** `GET /api/metrics/merchant/` — merchant-side metrics used on merchant dashboard. */
export type MerchantMetrics = {
  credit: {
    totalBorrowed: number
    activeLoans: number
    repaidLoans: number
    defaultedLoans: number
  }
  performance: {
    totalRepaid: number
    repaymentRatio: number
  }
  risk: {
    totalDefaulted: number
    defaultRate: number
  }
}

/** Raw API payload for `GET /api/metrics/merchant/`. */
export type MerchantMetricsApi = Record<string, unknown>

/** `GET /api/metrics/pool/` — dollar-like amounts are strings; ratios are numbers. */
export type PoolMetrics = {
  tvl: string
  liquidAssets: string
  outstanding: string
  availableLiquidity: string
  /** Utilization ratio in (0, 1] as a fraction (e.g. `0.65` → 65%), or percent points when greater than 1. */
  utilization: number
  /** APY in percent points (e.g. `5.25` → 5.25%). */
  apy: number
  minDeposit: number
}

/** Raw API payload for `GET /api/metrics/pool/` (may be snake_case, strings, or JSON numbers). */
export type PoolMetricsApi = Record<string, unknown>

/** API string fields: show exactly what the server sent (trimmed); empty → em dash. */
export function displayMetricsStringField(value: string): string {
  const t = typeof value === 'string' ? value.trim() : ''
  return t.length ? t : '—'
}

/** Fixed two fractional digits, no thousands separators (rates / percentages). */
function formatMetricNumberTwoDecimalsNoGrouping(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })
}

/** Fixed two fractional digits with grouping (amounts). */
function formatMetricNumberTwoDecimalsGrouped(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true })
}

function parseMoneyLikeInput(value: string | number): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const t = value.trim()
  if (!t) return null
  const significant = t.replace(/[^0-9.,-]/g, '')
  if (!significant || !/\d/.test(significant)) return null
  const normalized = significant.replace(/,/g, '')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

/**
 * Formats a numeric amount as USD: `$`, thousands separators, two decimal places.
 * Accepts a number or a string from the API (commas, `$`, trailing `USDC`, etc. are stripped for parsing).
 * If the value cannot be parsed as a number but the string is non-empty, the trimmed string is returned.
 */
export function displayDashboardMetricString(value: string | number): string {
  const n = parseMoneyLikeInput(value)
  if (n === null) {
    const t = typeof value === 'string' ? value.trim() : ''
    return t.length ? t : '—'
  }
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Percent from an API string: same numeric parsing as money fields, then `X.XX%`. */
export function displayDashboardPercentString(value: string): string {
  const n = parseMoneyLikeInput(value)
  if (n === null) {
    const t = value.trim()
    return t.length ? t : '—'
  }
  return `${formatMetricNumberTwoDecimalsNoGrouping(n)}%`
}

/** APY: numeric percent points from API — no scaling. */
export function displayPoolApyPercent(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return `${formatMetricNumberTwoDecimalsNoGrouping(value)}%`
}

/** ROI: numeric percent points from API — no scaling. */
export function displayInvestorRoiPercent(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return `${formatMetricNumberTwoDecimalsNoGrouping(value)}%`
}

/**
 * Utilization: numeric percent points from API (same as APY) — no scaling.
 * Backend `_to_pct` already multiplies the outstanding/TVL ratio by 100.
 */
export function displayPoolUtilization(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return `${formatMetricNumberTwoDecimalsNoGrouping(value)}%`
}

/** `minDeposit` as a plain formatted number (no currency symbol — API may encode units elsewhere). */
export function displayPoolMinDeposit(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return formatMetricNumberTwoDecimalsGrouped(value)
}

/**
 * Dashboard pool cards / merchant views: compact dollar display with two decimal places on the scale
 * (e.g. `$1.50M`, `$538,500.00`).
 */
export function formatDashboardCompactUsd(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const n = value
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Compact USD for API strings (or numbers): `$12.34K/M/B`, otherwise `$999.99`. */
export function displayDashboardCompactUsd(value: string | number): string {
  const n = parseMoneyLikeInput(value)
  if (n === null) {
    const t = typeof value === 'string' ? value.trim() : ''
    return t.length ? t : '—'
  }
  return formatDashboardCompactUsd(n)
}

/** Plain amount with grouping and two decimals (no `$`), for summary lines that append units separately. */
export function formatDashboardPlainAmount(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Values in `(0, 1]` are fractions (e.g. `0.65` → 65.00%); values greater than `1` are percent points (e.g. `65` → 65.00%).
 */
export function formatDashboardPercentMetric(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const pct = value > 1 ? value : value * 100
  return `${pct.toFixed(2)}%`
}

function apiBaseUrl(): string {
  // `VITE_API_BASE_URL` is expected to include `/api` (see `.env.example`).
  return requireApiBaseUrl()
}

function requireAccessToken(accessToken: string | null | undefined): string {
  const t = typeof accessToken === 'string' ? accessToken.trim() : ''
  if (!t) throw new Error('Missing access token for authorized metrics request.')
  return t
}

function tokenAuthValue(accessToken: string): string {
  const t = accessToken.trim()
  // Some backends return the whole `Token <key>` string; accept both.
  return /^Token\s+\S+/i.test(t) ? t : `Token ${t}`
}

function authHeaders(accessToken: string | null | undefined): HeadersInit {
  const token = requireAccessToken(accessToken)
  return {
    Accept: 'application/json',
    Authorization: tokenAuthValue(token),
  }
}

function asJsonObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
}

function pickObjectField(r: Record<string, unknown>, ...keys: string[]): Record<string, unknown> {
  for (const k of keys) {
    const v = r[k]
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  }
  return {}
}

/** Prefer first key present with a non-empty string or finite number (DRF snake_case vs camelCase). */
function pickStringField(r: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = r[k]
    if (typeof v === 'string') {
      const t = v.trim()
      if (t.length) return t
    }
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  }
  return ''
}

function pickNumberField(r: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = r[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v.replace(/,/g, ''))
      if (Number.isFinite(n)) return n
    }
  }
  return NaN
}

/**
 * Coerce `GET /api/metrics/investor/` JSON into `InvestorMetrics`.
 * Django often returns `net_deposited` while the UI historically used `netDeposited`.
 */
function normalizeInvestorMetricsPayload(raw: unknown): InvestorMetrics {
  const r = asJsonObject(raw)
  return {
    total_deposited: pickStringField(r, 'total_deposited', 'totalDeposited'),
    total_withdrawn: pickStringField(r, 'total_withdrawn', 'totalWithdrawn'),
    current_position_value: pickStringField(r, 'current_position_value', 'currentPositionValue'),
    total_interest_earned: pickStringField(r, 'total_interest_earned', 'totalInterestEarned'),
    share_of_pool: pickStringField(r, 'share_of_pool', 'shareOfPool'),
    netDeposited: pickStringField(r, 'netDeposited', 'net_deposited'),
    roi: pickNumberField(r, 'roi'),
  }
}

function normalizeMerchantMetricsPayload(raw: unknown): MerchantMetrics {
  const r = asJsonObject(raw)
  const credit = pickObjectField(r, 'credit')
  const performance = pickObjectField(r, 'performance')
  const risk = pickObjectField(r, 'risk')
  return {
    credit: {
      totalBorrowed: pickNumberField(credit, 'totalBorrowed', 'total_borrowed'),
      activeLoans: pickNumberField(credit, 'activeLoans', 'active_loans'),
      repaidLoans: pickNumberField(credit, 'repaidLoans', 'repaid_loans'),
      defaultedLoans: pickNumberField(credit, 'defaultedLoans', 'defaulted_loans'),
    },
    performance: {
      totalRepaid: pickNumberField(performance, 'totalRepaid', 'total_repaid'),
      repaymentRatio: pickNumberField(performance, 'repaymentRatio', 'repayment_ratio'),
    },
    risk: {
      totalDefaulted: pickNumberField(risk, 'totalDefaulted', 'total_defaulted'),
      defaultRate: pickNumberField(risk, 'defaultRate', 'default_rate'),
    },
  }
}

/** Coerce `GET /api/metrics/pool/` JSON into `PoolMetrics` (snake_case aliases). */
function normalizePoolMetricsPayload(raw: unknown): PoolMetrics {
  const r = asJsonObject(raw)
  return {
    tvl: pickStringField(r, 'tvl'),
    liquidAssets: pickStringField(r, 'liquidAssets', 'liquid_assets'),
    outstanding: pickStringField(r, 'outstanding'),
    availableLiquidity: pickStringField(r, 'availableLiquidity', 'available_liquidity'),
    utilization: pickNumberField(r, 'utilization'),
    apy: pickNumberField(r, 'apy'),
    minDeposit: pickNumberField(r, 'minDeposit', 'min_deposit'),
  }
}

export async function fetchPoolMetrics(accessToken: string | null | undefined): Promise<PoolMetrics> {
  const base = apiBaseUrl()
  const res = await fetchWithAuthRecovery(`${base}/api/metrics/pool/`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  })
  const raw = await parseJsonResponse<PoolMetricsApi>(res)
  return normalizePoolMetricsPayload(raw)
}

export async function fetchInvestorMetrics(accessToken: string | null | undefined): Promise<InvestorMetrics> {
  const base = apiBaseUrl()
  const res = await fetchWithAuthRecovery(`${base}/api/metrics/investor/`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  })
  const raw = await parseJsonResponse<InvestorMetricsApi>(res)
  return normalizeInvestorMetricsPayload(raw)
}

export async function fetchMerchantMetrics(accessToken: string | null | undefined): Promise<MerchantMetrics> {
  const base = apiBaseUrl()
  const res = await fetchWithAuthRecovery(`${base}/api/metrics/merchant/`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  })
  const raw = await parseJsonResponse<MerchantMetricsApi>(res)
  return normalizeMerchantMetricsPayload(raw)
}

/** `GET /api/metrics/investor/transactions` */
export type InvestorTransactionApi = {
  transaction_type: string
  /** Human-readable token amount (from wei). */
  amount: string
  timestamp: string
  transaction_hash: string
}

export type InvestorTransactionsResponse = {
  transactions: InvestorTransactionApi[]
}

export type FetchInvestorTransactionsParams = DashboardTransactionsListParams & {
  type?: 'all' | 'deposit' | 'withdrawal'
}

function mapInvestorTransactionRow(raw: unknown): InvestorTransactionApi | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const transaction_type = pickStringField(row, 'transaction_type', 'transactionType')
  const amount = pickStringField(row, 'amount')
  const timestamp = pickStringField(row, 'timestamp', 'created_at', 'createdAt')
  const transaction_hash = pickStringField(row, 'transaction_hash', 'transactionHash', 'tx_hash', 'hash')
  if (!transaction_type && !amount && !timestamp && !transaction_hash) return null
  return {
    transaction_type,
    amount,
    timestamp,
    transaction_hash,
  }
}

export async function fetchInvestorTransactionsList(
  accessToken: string | null | undefined,
  params?: FetchInvestorTransactionsParams,
): Promise<DashboardTransactionsListResult<InvestorTransactionApi>> {
  const base = apiBaseUrl()
  const limit = Math.min(Math.max(params?.limit ?? DASHBOARD_LIST_PAGE_SIZE, 1), 200)
  const offset = Math.max(params?.offset ?? 0, 0)
  const q = new URLSearchParams()
  q.set('limit', String(limit))
  q.set('offset', String(offset))
  const type = params?.type?.trim()
  if (type && type !== 'all') q.set('type', type)
  const search = params?.search?.trim()
  if (search) q.set('search', search)

  const res = await fetchWithAuthRecovery(`${base}/api/metrics/investor/transactions?${q.toString()}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  })
  const raw = await parseJsonResponse<unknown>(res)
  return normalizeDashboardTransactionsListResponse(raw, { offset, limit }, mapInvestorTransactionRow)
}

export async function fetchInvestorTransactions(
  accessToken: string | null | undefined,
): Promise<InvestorTransactionApi[]> {
  const data = await fetchInvestorTransactionsList(accessToken)
  return data.transactions
}

/** `GET /api/metrics/investor/withdrawal-requests/` */
export type InvestorWithdrawalRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'expired'

export type InvestorWithdrawalRequestRow = {
  id: string
  requestKey: string
  amount: string
  amountDisplay: string
  date: string
  dateDisplay: string
  occurredAt: string
  expiresAt: string | null
  status: InvestorWithdrawalRequestStatus
  statusLabel: string
  actions: { canWithdraw: boolean }
}

export type InvestorWithdrawalRequestsResult = {
  results: InvestorWithdrawalRequestRow[]
  total: number
}

export type FetchInvestorWithdrawalRequestsParams = {
  limit?: number
  offset?: number
}

function normalizeInvestorWithdrawalStatus(raw: string): InvestorWithdrawalRequestStatus {
  const t = raw.trim().toLowerCase()
  if (t === 'approved') return 'approved'
  if (t === 'rejected') return 'rejected'
  if (t === 'executed') return 'executed'
  if (t === 'expired') return 'expired'
  return 'pending'
}

function mapInvestorWithdrawalRequestRow(raw: unknown): InvestorWithdrawalRequestRow | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const requestKey = pickStringField(row, 'requestKey', 'request_key')
  if (!requestKey) return null
  const actionsRaw =
    row.actions && typeof row.actions === 'object' && !Array.isArray(row.actions)
      ? (row.actions as Record<string, unknown>)
      : {}
  const status = normalizeInvestorWithdrawalStatus(
    pickStringField(row, 'status') || pickStringField(row, 'statusLabel', 'status_label'),
  )
  return {
    id: pickStringField(row, 'id') || requestKey,
    requestKey,
    amount: pickStringField(row, 'amount') || '0.00',
    amountDisplay: pickStringField(row, 'amountDisplay', 'amount_display') || '—',
    date: pickStringField(row, 'date'),
    dateDisplay: pickStringField(row, 'dateDisplay', 'date_display') || pickStringField(row, 'date') || '—',
    occurredAt: pickStringField(row, 'occurredAt', 'occurred_at'),
    expiresAt: pickStringField(row, 'expiresAt', 'expires_at') || null,
    status,
    statusLabel: pickStringField(row, 'statusLabel', 'status_label') || status,
    actions: {
      canWithdraw:
        typeof actionsRaw.canWithdraw === 'boolean'
          ? actionsRaw.canWithdraw
          : typeof actionsRaw.can_withdraw === 'boolean'
            ? actionsRaw.can_withdraw
            : status === 'approved',
    },
  }
}

export async function fetchInvestorWithdrawalRequests(
  accessToken: string | null | undefined,
  params?: FetchInvestorWithdrawalRequestsParams,
): Promise<InvestorWithdrawalRequestsResult> {
  const base = apiBaseUrl()
  const limit = Math.min(Math.max(params?.limit ?? 50, 1), 200)
  const offset = Math.max(params?.offset ?? 0, 0)
  const q = new URLSearchParams()
  q.set('limit', String(limit))
  q.set('offset', String(offset))
  const res = await fetchWithAuthRecovery(
    `${base}/api/metrics/investor/withdrawal-requests/?${q.toString()}`,
    {
      method: 'GET',
      headers: authHeaders(accessToken),
    },
  )
  const raw = await parseJsonResponse<unknown>(res)
  const record =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const list = Array.isArray(record.results) ? record.results : []
  const results = list
    .map(mapInvestorWithdrawalRequestRow)
    .filter((row): row is InvestorWithdrawalRequestRow => row != null)
  const totalRaw = record.total
  const total =
    typeof totalRaw === 'number' && Number.isFinite(totalRaw)
      ? totalRaw
      : typeof totalRaw === 'string' && totalRaw.trim()
        ? Number(totalRaw)
        : results.length
  return { results, total: Number.isFinite(total) ? total : results.length }
}

/** `GET /api/metrics/merchant/transactions` */
export type MerchantTransactionApi = {
  transaction_type: string
  /** Already formatted for display by API (per integration contract). */
  amount: string
  timestamp: string
  transaction_hash: string
  receivable_id: string
}

export type MerchantTransactionsResponse = {
  transactions: MerchantTransactionApi[]
}

export type FetchMerchantTransactionsParams = DashboardTransactionsListParams & {
  type?: 'all' | 'loan' | 'withdrawal' | 'repayment'
}

function mapMerchantTransactionRow(raw: unknown): MerchantTransactionApi | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const transaction_type = pickStringField(row, 'transaction_type', 'transactionType')
  const amount = pickStringField(row, 'amount')
  const timestamp = pickStringField(row, 'timestamp', 'created_at', 'createdAt')
  const transaction_hash = pickStringField(row, 'transaction_hash', 'transactionHash', 'tx_hash', 'hash')
  const receivable_id = pickStringField(row, 'receivable_id', 'receivableId')
  if (!transaction_type && !amount && !timestamp && !transaction_hash) return null
  return {
    transaction_type,
    amount,
    timestamp,
    transaction_hash,
    receivable_id,
  }
}

export async function fetchMerchantTransactionsList(
  accessToken: string | null | undefined,
  params?: FetchMerchantTransactionsParams,
): Promise<DashboardTransactionsListResult<MerchantTransactionApi>> {
  const base = apiBaseUrl()
  const limit = Math.min(Math.max(params?.limit ?? DASHBOARD_LIST_PAGE_SIZE, 1), 200)
  const offset = Math.max(params?.offset ?? 0, 0)
  const q = new URLSearchParams()
  q.set('limit', String(limit))
  q.set('offset', String(offset))
  const type = params?.type?.trim()
  if (type && type !== 'all') q.set('type', type)
  const search = params?.search?.trim()
  if (search) q.set('search', search)

  const res = await fetchWithAuthRecovery(`${base}/api/metrics/merchant/transactions?${q.toString()}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  })
  const raw = await parseJsonResponse<unknown>(res)
  return normalizeDashboardTransactionsListResponse(raw, { offset, limit }, mapMerchantTransactionRow)
}

export async function fetchMerchantTransactions(
  accessToken: string | null | undefined,
): Promise<MerchantTransactionApi[]> {
  const data = await fetchMerchantTransactionsList(accessToken)
  return data.transactions
}

export const convertTimestampToDate = (timestamp: string): string => {
  const date = new Date(timestamp)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** `GET /api/metrics/admin/` — protocol-wide metrics (admin only). */
export type AdminMetrics = {
  capital: {
    tvl: string
    liquidAssets: string
    outstanding: string
    availableLiquidity: string
    /** Percent points (e.g. 65 → 65%). */
    utilization: number
    /** Percent points. */
    apy: number
  }
  credit: {
    activeLoans: number
    originatedPrincipal: string
    repaidPrincipal: string
    defaultedPrincipal: string
    /** Ratio in (0, 1] unless API sends percent points. */
    defaultRate: number
  }
  risk: {
    largestBorrowerExposure: string
    concentrationRatio: number
    overdueLoans: number
    impaired: string
  }
}

export type AdminMetricsApi = Record<string, unknown>

function normalizeAdminMetricsPayload(raw: unknown): AdminMetrics {
  const r = asJsonObject(raw)
  const capital = pickObjectField(r, 'capital')
  const credit = pickObjectField(r, 'credit')
  const risk = pickObjectField(r, 'risk')
  return {
    capital: {
      tvl: pickStringField(capital, 'tvl'),
      liquidAssets: pickStringField(capital, 'liquidAssets', 'liquid_assets'),
      outstanding: pickStringField(capital, 'outstanding'),
      availableLiquidity: pickStringField(
        capital,
        'availableLiquidity',
        'available_liquidity',
      ),
      utilization: pickNumberField(capital, 'utilization'),
      apy: pickNumberField(capital, 'apy'),
    },
    credit: {
      activeLoans: pickNumberField(credit, 'activeLoans', 'active_loans'),
      originatedPrincipal: pickStringField(
        credit,
        'originatedPrincipal',
        'originated_principal',
      ),
      repaidPrincipal: pickStringField(credit, 'repaidPrincipal', 'repaid_principal'),
      defaultedPrincipal: pickStringField(
        credit,
        'defaultedPrincipal',
        'defaulted_principal',
      ),
      defaultRate: pickNumberField(credit, 'defaultRate', 'default_rate'),
    },
    risk: {
      largestBorrowerExposure: pickStringField(
        risk,
        'largestBorrowerExposure',
        'largest_borrower_exposure',
      ),
      concentrationRatio: pickNumberField(risk, 'concentrationRatio', 'concentration_ratio'),
      overdueLoans: pickNumberField(risk, 'overdueLoans', 'overdue_loans'),
      impaired: pickStringField(risk, 'impaired'),
    },
  }
}

export async function fetchAdminMetrics(
  accessToken: string | null | undefined,
): Promise<AdminMetrics> {
  const base = apiBaseUrl()
  const res = await fetchWithAuthRecovery(`${base}/api/metrics/admin/`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  })
  const raw = await parseJsonResponse<AdminMetricsApi>(res)
  return normalizeAdminMetricsPayload(raw)
}

/** Point in monthly admin chart series (`GET …/metrics/admin/tvl/history/` etc.). */
export type AdminChartSeriesPoint = {
  month: string
  label: string
  /** Chart-friendly value in millions. */
  value: number
  /** Full TVL decimal string (TVL history endpoint). */
  tvl?: string
  /** Full principal decimal string (originated-principal history endpoint). */
  principal?: string
}

export type AdminChartHistory = {
  months: number
  asOf: string
  series: AdminChartSeriesPoint[]
}

type AdminChartHistoryApi = Record<string, unknown>

function normalizeChartSeriesPoint(
  raw: unknown,
  amountKey: 'tvl' | 'principal',
): AdminChartSeriesPoint | null {
  const r = asJsonObject(raw)
  const month = pickStringField(r, 'month')
  const label = pickStringField(r, 'label')
  const value = pickNumberField(r, 'value')
  if (!month && !label) return null
  const amount = pickStringField(r, amountKey)
  return {
    month: month || label,
    label: label || month,
    value: Number.isFinite(value) ? value : 0,
    ...(amountKey === 'tvl' ? { tvl: amount || undefined } : { principal: amount || undefined }),
  }
}

function normalizeAdminChartHistory(raw: unknown, amountKey: 'tvl' | 'principal'): AdminChartHistory {
  const r = asJsonObject(raw)
  const rawSeries = r.series
  const series: AdminChartSeriesPoint[] = []
  if (Array.isArray(rawSeries)) {
    for (const item of rawSeries) {
      const point = normalizeChartSeriesPoint(item, amountKey)
      if (point) series.push(point)
    }
  }
  return {
    months: pickNumberField(r, 'months') || series.length,
    asOf: pickStringField(r, 'asOf', 'as_of'),
    series,
  }
}

export async function fetchAdminTvlHistory(
  accessToken: string | null | undefined,
  options?: { months?: number },
): Promise<AdminChartHistory> {
  const base = apiBaseUrl()
  const months = options?.months ?? 7
  const url = `${base}/api/metrics/admin/tvl/history/?months=${encodeURIComponent(String(months))}`
  const res = await fetchWithAuthRecovery(url, {
    method: 'GET',
    headers: authHeaders(accessToken),
  })
  const raw = await parseJsonResponse<AdminChartHistoryApi>(res)
  return normalizeAdminChartHistory(raw, 'tvl')
}

export async function fetchAdminOriginatedPrincipalHistory(
  accessToken: string | null | undefined,
  options?: { months?: number },
): Promise<AdminChartHistory> {
  const base = apiBaseUrl()
  const months = options?.months ?? 7
  const url = `${base}/api/metrics/admin/originated-principal/history/?months=${encodeURIComponent(String(months))}`
  const res = await fetchWithAuthRecovery(url, {
    method: 'GET',
    headers: authHeaders(accessToken),
  })
  const raw = await parseJsonResponse<AdminChartHistoryApi>(res)
  return normalizeAdminChartHistory(raw, 'principal')
}
