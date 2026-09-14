import { fetchWithAuthRecovery } from '@/api/authorizedFetch'
import { apiUrl, parseJsonResponse } from '@/api/client'

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
  return parseJsonResponse<BridgeConfig>(res)
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
  return parseJsonResponse<BridgeBalancesResponse>(res)
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
