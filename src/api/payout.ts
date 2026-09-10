import { fetchWithAuthRecovery } from '@/api/authorizedFetch'
import { parseJsonResponse, requireApiBaseUrl } from '@/api/client'
import { parseAdminWriteResponse, type AdminWriteOutcome } from '@/api/adminActionResponse'
import { displayDashboardMetricString } from '@/api/metrics'
import { DASHBOARD_LIST_PAGE_SIZE } from '@/constants/listPagination'
import {
  FUNDING_POOL_ADDRESS,
  getFundingPoolAddress,
} from '@/contract_config/deployment'
import { isLocalContractNetwork, isMainnetContractNetwork, modeFromChainId } from '@/contract_config/contractNetwork'
import type { RecentTx } from '@/components/dashboard/investor/lending-pool-detail/types'
import { resolvePaginatedListTotal } from '@/utils/listPagination'
import { getAppStore } from '@/store/storeRef'

const RECENT_TRANSACTIONS_PATH = '/api/payout/recent-transactions/'

const TRANSACTION_ARRAY_KEYS = ['transactions', 'results', 'data', 'recent_transactions', 'items'] as const

const CONTRACT_KEYS = [
  'smart_contract_address',
  'contract_address',
  'pool_contract_address',
  'lending_pool_contract_address',
] as const

const EXPLORER_BASE_KEYS = [
  'block_explorer_base_url',
  'explorer_base_url',
  'arbitrum_sepolia_block_explorer_url',
  'sepolia_block_explorer_url',
  'eth_sepolia_block_explorer_url',
] as const

/** Row shape from `GET /api/payout/recent-transactions/`. */
export type RecentTxApi = {
  transaction_type: string
  amount: number
  contract_address: string
  time_since: string
  /** On-chain tx hash — explorer row link targets `/tx/…` when present. */
  transaction_hash?: string
}

/** JSON body for recent transactions (strict DRF shape). */
export type RecentTxResponse = {
  transactions: RecentTxApi[]
  /** Total matching rows across pages (pagination). */
  total?: number
}

function readEnvTrim(key: string): string {
  const raw = (import.meta.env as Record<string, string | undefined>)[key]?.trim()
  return raw ?? ''
}

/** Vite: Arbitrum Sepolia explorer origin (no trailing slash), e.g. `https://sepolia.arbiscan.io` */
export function getDefaultArbitrumSepoliaBlockExplorerBase(): string | null {
  const raw =
    readEnvTrim('VITE_ARBITRUM_SEPOLIA_BLOCK_EXPLORER_URL') ||
    readEnvTrim('VITE_ETH_SEPOLIA_BLOCK_EXPLORER_URL')
  if (!raw) return null
  return raw.replace(/\/+$/, '')
}

/** Vite: Arbitrum One explorer origin (no trailing slash), e.g. `https://arbiscan.io` */
export function getDefaultArbitrumOneBlockExplorerBase(): string | null {
  const raw = readEnvTrim('VITE_ARBITRUM_BLOCK_EXPLORER_URL') || 'https://arbiscan.io'
  return raw.replace(/\/+$/, '')
}

/** Vite: Arc Testnet explorer origin (no trailing slash), e.g. `https://testnet.arcscan.app` */
export function getDefaultArcTestnetBlockExplorerBase(): string | null {
  const raw = readEnvTrim('VITE_ARC_TESTNET_BLOCK_EXPLORER_URL') || 'https://testnet.arcscan.app'
  return raw.replace(/\/+$/, '')
}

function resolveExplorerChainId(explicit?: number | null): number | null {
  if (explicit != null && Number.isFinite(explicit)) return Math.trunc(explicit)
  try {
    const state = getAppStore()?.getState()
    const authChainId = state?.auth.chainId
    const walletChainId = state?.wallet.chainId
    if (authChainId != null) return authChainId
    if (walletChainId != null) return walletChainId
  } catch {
    /* store unavailable */
  }
  return null
}

/** Optional pool smart contract when the payout API does not return one on the envelope. */
export function getDefaultPoolContractAddress(chainId?: number | null): string | null {
  const id = resolveExplorerChainId(chainId)
  if (id != null) {
    const mode = modeFromChainId(id)
    if (mode === 'local' || mode === 'mainnet' || mode === 'arc-testnet') {
      return getFundingPoolAddress(id)
    }
    if (mode === 'testnet') return getDefaultArbitrumSepoliaPoolContractAddress() ?? getFundingPoolAddress(id)
  }
  if (isLocalContractNetwork() || isMainnetContractNetwork()) {
    return FUNDING_POOL_ADDRESS
  }
  return getDefaultArbitrumSepoliaPoolContractAddress()
}

/** Block explorer origin when the API does not send one. */
export function getDefaultBlockExplorerBase(chainId?: number | null): string | null {
  const id = resolveExplorerChainId(chainId)
  const mode = id != null ? modeFromChainId(id) : null
  if (mode === 'local' || (mode == null && isLocalContractNetwork())) {
    const raw = readEnvTrim('VITE_LOCAL_BLOCK_EXPLORER_URL')
    if (!raw) return null
    return raw.replace(/\/+$/, '')
  }
  if (mode === 'mainnet' || (mode == null && isMainnetContractNetwork())) {
    return getDefaultArbitrumOneBlockExplorerBase()
  }
  if (mode === 'arc-testnet') {
    return getDefaultArcTestnetBlockExplorerBase()
  }
  return getDefaultArbitrumSepoliaBlockExplorerBase()
}

/** Optional pool smart contract on Arbitrum Sepolia when the payout API does not return one on the envelope. */
export function getDefaultArbitrumSepoliaPoolContractAddress(): string | null {
  const raw =
    readEnvTrim('VITE_ARBITRUM_SEPOLIA_POOL_CONTRACT_ADDRESS') ||
    readEnvTrim('VITE_ETH_SEPOLIA_POOL_CONTRACT_ADDRESS')
  if (!raw || !/^0x[a-fA-F0-9]{40}$/i.test(raw)) return null
  return raw
}

/** @deprecated Use {@link getDefaultArbitrumSepoliaBlockExplorerBase} */
export const getDefaultSepoliaBlockExplorerBase = getDefaultArbitrumSepoliaBlockExplorerBase

/** @deprecated Use {@link getDefaultArbitrumSepoliaPoolContractAddress} */
export const getDefaultSepoliaPoolContractAddress = getDefaultArbitrumSepoliaPoolContractAddress

export function blockExplorerAddressUrl(base: string, address: string): string | null {
  const b = base.trim().replace(/\/+$/, '')
  const a = address.trim()
  if (!b || !/^0x[a-fA-F0-9]{40}$/i.test(a)) return null
  return `${b}/address/${a}`
}

/** Canonical `0x` + 64 hex chars for an Ethereum tx hash, or `null`. */
function normalizeEthereumTxHash(raw: string): string | null {
  const t = raw.trim()
  if (/^[a-fA-F0-9]{64}$/i.test(t)) return `0x${t}`
  if (/^0x[a-fA-F0-9]{64}$/i.test(t)) return t
  return null
}

/** Block-explorer-style `/tx/{hash}` (32-byte hash, with or without `0x`). */
export function blockExplorerTxUrl(base: string, txHash: string): string | null {
  const b = base.trim().replace(/\/+$/, '')
  const h = normalizeEthereumTxHash(txHash)
  if (!b || !h) return null
  return `${b}/tx/${h}`
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object') return null
  return v as Record<string, unknown>
}

function pickString(obj: Record<string, unknown>, keys: readonly string[]): string {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

function isHexAddress(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/i.test(s.trim())
}

function shortEthAddress(addr: string): string {
  const a = addr.trim()
  if (!a) return '—'
  if (a.length <= 12) return a
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

function extractTransactionRows(body: unknown): unknown[] {
  if (Array.isArray(body)) return body
  const o = asRecord(body)
  if (!o) return []
  for (const k of TRANSACTION_ARRAY_KEYS) {
    const v = o[k]
    if (Array.isArray(v)) return v
  }
  return []
}

function extractContractAndExplorer(body: unknown): { contractAddress: string | null; explorerBaseUrl: string | null } {
  const o = asRecord(body)
  if (!o) return { contractAddress: null, explorerBaseUrl: null }
  let contractAddress: string | null = null
  for (const k of CONTRACT_KEYS) {
    const v = o[k]
    if (typeof v === 'string' && isHexAddress(v)) {
      contractAddress = v.trim()
      break
    }
  }
  let explorerBaseUrl: string | null = null
  for (const k of EXPLORER_BASE_KEYS) {
    const v = o[k]
    if (typeof v === 'string' && v.trim()) {
      explorerBaseUrl = v.trim().replace(/\/+$/, '')
      break
    }
  }
  return { contractAddress, explorerBaseUrl }
}

function isRecentTxApiRow(row: unknown): row is RecentTxApi {
  if (!row || typeof row !== 'object') return false
  const r = row as Record<string, unknown>
  return (
    typeof r.transaction_type === 'string' &&
    typeof r.amount === 'number' &&
    Number.isFinite(r.amount) &&
    typeof r.contract_address === 'string' &&
    typeof r.time_since === 'string'
  )
}

function isRecentTxResponseShape(json: unknown): json is RecentTxResponse {
  const o = asRecord(json)
  if (!o || !Array.isArray(o.transactions)) return false
  if (o.transactions.length === 0) return true
  return o.transactions.every(isRecentTxApiRow)
}

function inferAmountToneFromAmount(amountStr: string): RecentTx['amountTone'] {
  const s = amountStr.trim()
  if (s.startsWith('-') || s.startsWith('(')) return 'negative'
  if (s.startsWith('+')) return 'positive'
  return 'neutral'
}

function mapStrictApiRow(tx: RecentTxApi, index: number, explorerBase: string | null): RecentTx {
  const contract = tx.contract_address.trim()
  const walletShort = isHexAddress(contract) ? shortEthAddress(contract) : contract || '—'
  const txHashRaw = typeof tx.transaction_hash === 'string' ? tx.transaction_hash : ''
  const txHashNorm = normalizeEthereumTxHash(txHashRaw)
  const walletExplorerHref =
    explorerBase && txHashNorm ? blockExplorerTxUrl(explorerBase, txHashNorm) : null

  const amountStr = displayDashboardMetricString(tx.amount)
  const amountTone: RecentTx['amountTone'] =
    tx.amount < 0 ? 'negative' : tx.amount > 0 ? 'positive' : 'neutral'

  const id = txHashNorm ?? `${index}-${contract}-${tx.time_since}`

  return {
    id,
    walletShort,
    type: tx.transaction_type.trim() || '—',
    amount: amountStr === '—' ? String(tx.amount) : amountStr,
    amountTone,
    timeAgo: tx.time_since.trim() || '—',
    walletExplorerHref: walletExplorerHref ?? undefined,
  }
}

function parseStrictRecentTxResponse(json: RecentTxResponse, total: number): RecentPayoutBundle {
  const envelope = extractContractAndExplorer(json)
  const explorerBase = envelope.explorerBaseUrl || getDefaultBlockExplorerBase()

  const firstRowContract = json.transactions.find((t) => isHexAddress(t.contract_address))?.contract_address.trim()
  const contractAddress =
    envelope.contractAddress ?? (firstRowContract && isHexAddress(firstRowContract) ? firstRowContract : null) ??
    getDefaultPoolContractAddress()

  const transactions = json.transactions.map((row, i) => mapStrictApiRow(row, i, explorerBase))

  return {
    transactions,
    contractAddress,
    explorerBaseUrl: explorerBase,
    total,
  }
}

function inferAmountTone(amount: string, raw: Record<string, unknown>): RecentTx['amountTone'] {
  const d = raw.direction ?? raw.amount_direction ?? raw.flow
  if (typeof d === 'string') {
    const x = d.toLowerCase()
    if (['credit', 'in', 'positive', 'deposit', 'inbound'].includes(x)) return 'positive'
    if (['debit', 'out', 'negative', 'withdraw', 'outbound'].includes(x)) return 'negative'
  }
  return inferAmountToneFromAmount(amount)
}

function mapLegacyRowToRecentTx(raw: unknown, index: number, explorerBase: string | null): RecentTx | null {
  const r = asRecord(raw)
  if (!r) return null

  const contractFull =
    pickString(r, ['contract_address', 'pool_contract_address', 'smart_contract_address']) ||
    pickString(r, ['lending_pool_contract_address']) ||
    ''

  const walletFull =
    pickString(r, [
      'wallet_address',
      'wallet',
      'signer_address',
      'from_address',
      'from',
      'address',
      'user_wallet',
      'account',
    ]) || ''

  const id =
    pickString(r, ['id', 'pk', 'transaction_id', 'tx_id', 'uuid']) ||
    pickString(r, ['tx_hash', 'transaction_hash', 'hash']) ||
    String(index)

  const type = pickString(r, ['type', 'transaction_type', 'kind', 'label', 'description']) || '—'

  let amount =
    pickString(r, ['amount', 'amount_display', 'value', 'value_display', 'formatted_amount']) || ''
  if (!amount && typeof r.amount === 'number' && Number.isFinite(r.amount)) {
    amount = displayDashboardMetricString(r.amount)
  }
  if (!amount) amount = '—'

  const timeAgo =
    pickString(r, ['time_since', 'time_ago', 'relative_time', 'display_time', 'created_at_display']) ||
    pickString(r, ['created_at', 'timestamp', 'occurred_at']) ||
    '—'

  const txHashRaw = pickString(r, ['transaction_hash', 'tx_hash', 'transactionHash'])
  const txHashNorm = normalizeEthereumTxHash(txHashRaw)

  const linkTarget = contractFull && isHexAddress(contractFull) ? contractFull : walletFull
  const walletShort =
    linkTarget && isHexAddress(linkTarget)
      ? shortEthAddress(linkTarget)
      : pickString(r, ['wallet_short', 'wallet_display']) || (linkTarget ? linkTarget : '—')

  const walletExplorerHref =
    explorerBase && txHashNorm
      ? blockExplorerTxUrl(explorerBase, txHashNorm)
      : explorerBase && linkTarget && isHexAddress(linkTarget)
        ? blockExplorerAddressUrl(explorerBase, linkTarget)
        : null

  return {
    id,
    walletShort,
    type,
    amount,
    amountTone: inferAmountTone(amount, r),
    timeAgo,
    walletExplorerHref: walletExplorerHref ?? undefined,
  }
}

export type RecentPayoutBundle = {
  transactions: RecentTx[]
  contractAddress: string | null
  explorerBaseUrl: string | null
  total: number
}

export type FetchRecentPayoutTransactionsParams = {
  limit?: number
  offset?: number
}

function pickNumber(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}

function resolveRecentPayoutTotal(
  json: unknown,
  transactionsLength: number,
  params: { offset: number; limit: number },
): number {
  const record = asRecord(json)
  const apiTotal = record ? pickNumber(record, 'total', 'count') : null
  return (
    apiTotal ??
    resolvePaginatedListTotal({
      apiTotal,
      offset: params.offset,
      pageSize: params.limit,
      resultsLength: transactionsLength,
    })
  )
}

export function parseRecentPayoutResponse(json: unknown, params?: FetchRecentPayoutTransactionsParams): RecentPayoutBundle {
  const limit = Math.min(Math.max(params?.limit ?? DASHBOARD_LIST_PAGE_SIZE, 1), 200)
  const offset = Math.max(params?.offset ?? 0, 0)

  if (isRecentTxResponseShape(json)) {
    const total = resolveRecentPayoutTotal(json, json.transactions.length, { offset, limit })
    return parseStrictRecentTxResponse(json, total)
  }

  const rows = extractTransactionRows(json)
  const meta = extractContractAndExplorer(json)
  const explorerBase = meta.explorerBaseUrl || getDefaultBlockExplorerBase()
  const contractAddress = meta.contractAddress || getDefaultPoolContractAddress()

  const transactions: RecentTx[] = []
  rows.forEach((row, i) => {
    const tx = mapLegacyRowToRecentTx(row, i, explorerBase)
    if (tx) transactions.push(tx)
  })

  const total = resolveRecentPayoutTotal(json, transactions.length, { offset, limit })

  return {
    transactions,
    contractAddress,
    explorerBaseUrl: explorerBase,
    total,
  }
}

function authHeaders(accessToken: string | null | undefined): HeadersInit {
  const t = typeof accessToken === 'string' ? accessToken.trim() : ''
  if (!t) throw new Error('Missing access token for payout API request.')
  return {
    Accept: 'application/json',
    Authorization: `Token ${t}`,
  }
}

export async function fetchRecentPayoutTransactions(
  accessToken: string | null | undefined,
  params?: FetchRecentPayoutTransactionsParams,
): Promise<RecentPayoutBundle> {
  const base = requireApiBaseUrl()
  const limit = Math.min(Math.max(params?.limit ?? DASHBOARD_LIST_PAGE_SIZE, 1), 200)
  const offset = Math.max(params?.offset ?? 0, 0)
  const q = new URLSearchParams()
  q.set('limit', String(limit))
  q.set('offset', String(offset))

  const res = await fetchWithAuthRecovery(`${base}${RECENT_TRANSACTIONS_PATH}?${q.toString()}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  })
  const json = await parseJsonResponse<unknown>(res)
  return parseRecentPayoutResponse(json, { limit, offset })
}

const PAYOUT_INITIATE_PATH = '/api/payout/initiate/'
const MERCHANT_REPAYMENT_SUBMIT_PATH = '/api/payout/repayment/submit/'

export type ReceivablePayoutStatus = {
  receivableId: string
  isPaidOut: boolean
}

function payoutStatusPath(receivableId: string): string {
  const id = receivableId.trim()
  if (!id) throw new Error('Missing receivable id.')
  return `/api/payout/status/${encodeURIComponent(id)}/`
}

function pickPayoutBool(record: Record<string, unknown>, ...keys: string[]): boolean {
  for (const key of keys) {
    const v = record[key]
    if (typeof v === 'boolean') return v
  }
  return false
}

function normalizeReceivablePayoutStatus(
  receivableId: string,
  raw: unknown,
): ReceivablePayoutStatus {
  const r = asRecord(raw) ?? {}
  const nested = asRecord(r.payout ?? r.payout_status ?? r.status) ?? {}
  const isPaidOut =
    pickPayoutBool(r, 'is_paid_out', 'isPaidOut', 'paid_out', 'paidOut') ||
    pickPayoutBool(nested, 'is_paid_out', 'isPaidOut', 'paid_out', 'paidOut')
  return { receivableId, isPaidOut }
}

/** `GET /api/payout/status/{receivable_id}/` — whether ERC20 was disbursed to the merchant. */
export async function fetchReceivablePayoutStatus(
  accessToken: string | null | undefined,
  receivableId: string,
  options?: { signal?: AbortSignal },
): Promise<ReceivablePayoutStatus> {
  const id = receivableId.trim()
  if (!id) throw new Error('Missing receivable id.')

  const base = requireApiBaseUrl()
  const res = await fetchWithAuthRecovery(`${base}${payoutStatusPath(id)}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
    signal: options?.signal,
  })
  const json = await parseJsonResponse<unknown>(res)
  return normalizeReceivablePayoutStatus(id, json)
}

/** `POST /api/payout/initiate/` — disburse funded capital to the merchant wallet. */
export async function postAdminPayoutInitiate(
  accessToken: string | null | undefined,
  receivableId: string,
  options?: { signal?: AbortSignal },
): Promise<AdminWriteOutcome> {
  const id = receivableId.trim()
  if (!id) throw new Error('Missing receivable id.')

  const base = requireApiBaseUrl()
  const res = await fetchWithAuthRecovery(`${base}${PAYOUT_INITIATE_PATH}`, {
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

/** `POST /api/payout/repayment/submit/` — servicer executes repayment after merchant token approval. */
export async function postMerchantRepaymentSubmit(
  accessToken: string | null | undefined,
  receivableId: string,
  amountWei: bigint,
  options?: { signal?: AbortSignal },
): Promise<AdminWriteOutcome> {
  const id = receivableId.trim()
  if (!id) throw new Error('Missing receivable id.')
  if (amountWei <= 0n) throw new Error('Repayment amount must be greater than zero.')

  const base = requireApiBaseUrl()
  const res = await fetchWithAuthRecovery(`${base}${MERCHANT_REPAYMENT_SUBMIT_PATH}`, {
    method: 'POST',
    headers: {
      ...authHeaders(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      receivable_id: id,
      amount_wei: amountWei.toString(),
    }),
    signal: options?.signal,
  })
  return parseAdminWriteResponse(res)
}

/** @deprecated Use {@link fetchAdminLatestRepayments} from `@/api/adminLoan`. */
export type { AdminRepaymentApi } from '@/api/adminLoan'

/** @deprecated Use {@link fetchAdminLatestRepayments} from `@/api/adminLoan`. */
export { fetchAdminLatestRepayments as fetchAdminRepaymentHistory } from '@/api/adminLoan'
