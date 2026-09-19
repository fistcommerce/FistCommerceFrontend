import { fetchWithAuthRecovery } from '@/api/authorizedFetch'
import { apiUrl, parseJsonResponse } from '@/api/client'
import { ARC_TESTNET_CHAIN_ID } from '@/contract_config/contractNetwork'

function authHeaders(accessToken: string | null | undefined): HeadersInit {
  const t = typeof accessToken === 'string' ? accessToken.trim() : ''
  if (!t) throw new Error('Missing access token for bridge API request.')
  return {
    Accept: 'application/json',
    Authorization: `Token ${t}`,
  }
}

function jsonAuthHeaders(accessToken: string | null | undefined): HeadersInit {
  return {
    ...authHeaders(accessToken),
    'Content-Type': 'application/json',
  }
}

export type BridgePurpose = 'deposit' | 'repayment'

export type BridgeEligibleBalance = {
  chainId: number
  label: string
  bridgeKitId: string | null
  usdcAddress: string
  usdcDecimals: number
  requiresBridge: boolean
  nextAction?: Record<string, string>
  primaryNextAction?: string | null
  balance?: string | null
  balanceWei?: string | null
  sufficient?: boolean | null
  error?: string | null
}

export type BridgeConfig = {
  destination: {
    chainId: number
    cctpDomain: number
    bridgeKitId: string
    usdcAddress: string
    usdcDecimals: number
  }
  sources: Array<{
    chainId: number
    cctpDomain: number
    label: string
    bridgeKitId: string
    usdcAddress: string
    usdcDecimals: number
  }>
  eligibleBalances?: BridgeEligibleBalance[]
  fundingPool?: {
    address?: string | null
    acceptedToken?: string | null
    acceptsArcUsdc?: boolean | null
  }
  recommendedFlow?: string[]
  package?: string
}

export type BridgeBalancesResponse = {
  purpose: BridgePurpose
  amount: string | null
  wallet: string
  balances: BridgeEligibleBalance[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function pickNum(r: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = r[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v)
  }
  return null
}

function pickStr(r: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = r[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

function pickBool(r: Record<string, unknown>, ...keys: string[]): boolean | null {
  for (const k of keys) {
    const v = r[k]
    if (typeof v === 'boolean') return v
  }
  return null
}

/** Normalize camelCase / snake_case balance rows from bridge APIs. */
export function normalizeEligibleBalance(raw: unknown): BridgeEligibleBalance | null {
  const r = asRecord(raw)
  if (!r) return null
  const chainId = pickNum(r, 'chainId', 'chain_id')
  if (chainId == null) return null
  const requiresBridge = pickBool(r, 'requiresBridge', 'requires_bridge')
  return {
    chainId,
    label: pickStr(r, 'label', 'name') ?? `Chain ${chainId}`,
    bridgeKitId: pickStr(r, 'bridgeKitId', 'bridge_kit_id'),
    usdcAddress: pickStr(r, 'usdcAddress', 'usdc_address') ?? '',
    usdcDecimals: pickNum(r, 'usdcDecimals', 'usdc_decimals') ?? 6,
    requiresBridge: requiresBridge ?? chainId !== ARC_TESTNET_CHAIN_ID,
    nextAction: (asRecord(r.nextAction) ?? asRecord(r.next_action) ?? undefined) as
      | Record<string, string>
      | undefined,
    primaryNextAction: pickStr(r, 'primaryNextAction', 'primary_next_action'),
    balance: pickStr(r, 'balance'),
    balanceWei: pickStr(r, 'balanceWei', 'balance_wei'),
    sufficient: pickBool(r, 'sufficient'),
    error: pickStr(r, 'error'),
  }
}

export function normalizeEligibleBalanceList(raw: unknown): BridgeEligibleBalance[] {
  if (!Array.isArray(raw)) return []
  const out: BridgeEligibleBalance[] = []
  for (const item of raw) {
    const row = normalizeEligibleBalance(item)
    if (row) out.push(row)
  }
  return out
}

/** Build selectable rows from `/bridge/config/` when balances are sparse. */
export function eligibleRowsFromBridgeConfig(config: BridgeConfig): BridgeEligibleBalance[] {
  const fromEligible = normalizeEligibleBalanceList(config.eligibleBalances)
  if (fromEligible.length > 0) return fromEligible

  const dest = config.destination
  const rows: BridgeEligibleBalance[] = []
  if (dest?.chainId != null) {
    rows.push({
      chainId: dest.chainId,
      label: 'Arc Testnet',
      bridgeKitId: dest.bridgeKitId ?? 'Arc_Testnet',
      usdcAddress: dest.usdcAddress ?? '',
      usdcDecimals: dest.usdcDecimals ?? 6,
      requiresBridge: false,
    })
  }
  for (const s of config.sources ?? []) {
    rows.push({
      chainId: s.chainId,
      label: s.label,
      bridgeKitId: s.bridgeKitId,
      usdcAddress: s.usdcAddress,
      usdcDecimals: s.usdcDecimals,
      requiresBridge: true,
    })
  }
  return rows
}

/**
 * Prefer live `/bridge/balances/` rows; keep every config-eligible chain visible
 * so CCTP sources still appear when the balances payload is Arc-only or empty.
 */
export function mergeBridgeBalanceRows(
  config: BridgeConfig | null | undefined,
  apiRows: BridgeEligibleBalance[],
): BridgeEligibleBalance[] {
  const base = config ? eligibleRowsFromBridgeConfig(config) : []
  const byId = new Map<number, BridgeEligibleBalance>()
  for (const row of base) byId.set(row.chainId, row)
  for (const row of apiRows) {
    const prev = byId.get(row.chainId)
    byId.set(row.chainId, prev ? { ...prev, ...row } : row)
  }
  if (byId.size === 0) return apiRows
  // Preserve config order (Arc first, then sources), then any extra API-only rows.
  const ordered: BridgeEligibleBalance[] = []
  const seen = new Set<number>()
  for (const row of base) {
    const hit = byId.get(row.chainId)
    if (hit) {
      ordered.push(hit)
      seen.add(row.chainId)
    }
  }
  for (const [id, row] of byId) {
    if (!seen.has(id)) ordered.push(row)
  }
  return ordered
}

function normalizeBridgeBalancesPayload(raw: unknown): BridgeBalancesResponse {
  const r = asRecord(raw) ?? {}
  const fromBalances = normalizeEligibleBalanceList(r.balances)
  const fromEligible = normalizeEligibleBalanceList(r.eligibleBalances)
  const fromEligibleSnake = normalizeEligibleBalanceList(r.eligible_balances)
  const balances =
    fromBalances.length > 0
      ? fromBalances
      : fromEligible.length > 0
        ? fromEligible
        : fromEligibleSnake
  return {
    purpose: (pickStr(r, 'purpose') as BridgePurpose) || 'deposit',
    amount: pickStr(r, 'amount'),
    wallet: pickStr(r, 'wallet') ?? '',
    balances,
  }
}

function normalizeBridgeConfigPayload(raw: unknown): BridgeConfig {
  const r = asRecord(raw) ?? {}
  const dest = asRecord(r.destination) ?? {}
  const sourcesRaw = Array.isArray(r.sources) ? r.sources : []
  return {
    destination: {
      chainId: pickNum(dest, 'chainId', 'chain_id') ?? ARC_TESTNET_CHAIN_ID,
      cctpDomain: pickNum(dest, 'cctpDomain', 'cctp_domain') ?? 0,
      bridgeKitId: pickStr(dest, 'bridgeKitId', 'bridge_kit_id') ?? 'Arc_Testnet',
      usdcAddress: pickStr(dest, 'usdcAddress', 'usdc_address') ?? '',
      usdcDecimals: pickNum(dest, 'usdcDecimals', 'usdc_decimals') ?? 6,
    },
    sources: sourcesRaw
      .map((item) => {
        const s = asRecord(item)
        if (!s) return null
        const chainId = pickNum(s, 'chainId', 'chain_id')
        if (chainId == null) return null
        return {
          chainId,
          cctpDomain: pickNum(s, 'cctpDomain', 'cctp_domain') ?? 0,
          label: pickStr(s, 'label') ?? `Chain ${chainId}`,
          bridgeKitId: pickStr(s, 'bridgeKitId', 'bridge_kit_id') ?? '',
          usdcAddress: pickStr(s, 'usdcAddress', 'usdc_address') ?? '',
          usdcDecimals: pickNum(s, 'usdcDecimals', 'usdc_decimals') ?? 6,
        }
      })
      .filter((s): s is NonNullable<typeof s> => s != null),
    eligibleBalances: normalizeEligibleBalanceList(
      r.eligibleBalances ?? r.eligible_balances,
    ),
    fundingPool: (asRecord(r.fundingPool) ?? asRecord(r.funding_pool) ?? undefined) as
      | BridgeConfig['fundingPool']
      | undefined,
    recommendedFlow: Array.isArray(r.recommendedFlow)
      ? (r.recommendedFlow as string[])
      : Array.isArray(r.recommended_flow)
        ? (r.recommended_flow as string[])
        : undefined,
    package: pickStr(r, 'package') ?? undefined,
  }
}

export type BridgeTransfer = {
  id: string
  dest_chain_id: number
  source_chain_id: number
  bridge_kit_source: string
  bridge_kit_dest: string
  amount_wei: string
  amount_human: string
  token_decimals: number
  recipient_address: string
  status: string
  purpose?: BridgePurpose
  burn_tx_hash?: string
  mint_tx_hash?: string
  deposit_tx_hash?: string
  loan_request_id?: string | null
}

export type BridgePlanTx = {
  step: string
  to: string
  data: string
  value: string
  description?: string
}

export type BridgeDepositPlan = {
  chainId: number
  amountWei: string
  amount: string
  tokenDecimals: number
  acceptedToken: { address: string }
  fundingPool: { address: string }
  transactions: BridgePlanTx[]
  poolAcceptsArcUsdc?: boolean
  warning?: string
  bridgeTransferId?: string
}

export type BridgeRepayPlan = {
  chainId: number
  amountWei: string
  amount: string
  tokenDecimals: number
  acceptedToken: { address: string }
  payoutRouter: { address: string }
  transactions: BridgePlanTx[]
  bridgeTransferId?: string
  warning?: string
}

export async function fetchBridgeConfig(options?: { signal?: AbortSignal }): Promise<BridgeConfig> {
  const res = await fetch(apiUrl('/bridge/config/'), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: options?.signal,
  })
  const raw = await parseJsonResponse<unknown>(res)
  return normalizeBridgeConfigPayload(raw)
}

export async function fetchBridgeBalances(
  accessToken: string | null | undefined,
  params: { purpose: BridgePurpose; amount?: string | number; signal?: AbortSignal },
): Promise<BridgeBalancesResponse> {
  const q = new URLSearchParams()
  q.set('purpose', params.purpose)
  if (params.amount != null && String(params.amount).trim() !== '') {
    q.set('amount', String(params.amount).trim())
  }
  const res = await fetchWithAuthRecovery(`${apiUrl('/bridge/balances/')}?${q}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
    signal: params.signal,
  })
  const raw = await parseJsonResponse<unknown>(res)
  return normalizeBridgeBalancesPayload(raw)
}

export async function createBridgeTransfer(
  accessToken: string | null | undefined,
  body: {
    source_chain_id?: number
    bridge_kit_source?: string
    amount?: string
    amount_wei?: string
    recipient_address: string
    purpose?: BridgePurpose
    loan_request_id?: string
    metadata?: Record<string, unknown>
  },
): Promise<BridgeTransfer> {
  const res = await fetchWithAuthRecovery(apiUrl('/bridge/transfers/'), {
    method: 'POST',
    headers: jsonAuthHeaders(accessToken),
    body: JSON.stringify(body),
  })
  return parseJsonResponse<BridgeTransfer>(res)
}

export async function patchBridgeTransfer(
  accessToken: string | null | undefined,
  transferId: string,
  body: Record<string, unknown>,
): Promise<BridgeTransfer> {
  const res = await fetchWithAuthRecovery(apiUrl(`/bridge/transfers/${transferId}/`), {
    method: 'PATCH',
    headers: jsonAuthHeaders(accessToken),
    body: JSON.stringify(body),
  })
  return parseJsonResponse<BridgeTransfer>(res)
}

export async function postDepositPlan(
  accessToken: string | null | undefined,
  body: { amount?: string; amount_wei?: string; depositor?: string },
): Promise<BridgeDepositPlan> {
  const res = await fetchWithAuthRecovery(apiUrl('/bridge/deposit-plan/'), {
    method: 'POST',
    headers: jsonAuthHeaders(accessToken),
    body: JSON.stringify(body),
  })
  return parseJsonResponse<BridgeDepositPlan>(res)
}

export async function postTransferDepositPlan(
  accessToken: string | null | undefined,
  transferId: string,
): Promise<BridgeDepositPlan> {
  const res = await fetchWithAuthRecovery(apiUrl(`/bridge/transfers/${transferId}/deposit-plan/`), {
    method: 'POST',
    headers: jsonAuthHeaders(accessToken),
  })
  return parseJsonResponse<BridgeDepositPlan>(res)
}

export async function postRepayPlan(
  accessToken: string | null | undefined,
  body: {
    amount?: string
    amount_wei?: string
    merchant?: string
    loan_request_id?: string
    receivable_id?: string
  },
): Promise<BridgeRepayPlan> {
  const res = await fetchWithAuthRecovery(apiUrl('/bridge/repay-plan/'), {
    method: 'POST',
    headers: jsonAuthHeaders(accessToken),
    body: JSON.stringify(body),
  })
  return parseJsonResponse<BridgeRepayPlan>(res)
}

export async function postTransferRepayPlan(
  accessToken: string | null | undefined,
  transferId: string,
): Promise<BridgeRepayPlan> {
  const res = await fetchWithAuthRecovery(apiUrl(`/bridge/transfers/${transferId}/repay-plan/`), {
    method: 'POST',
    headers: jsonAuthHeaders(accessToken),
  })
  return parseJsonResponse<BridgeRepayPlan>(res)
}
