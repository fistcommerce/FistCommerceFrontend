import { parseAdminWriteResponse } from '@/api/adminActionResponse'
import { apiUrl, parseJsonResponse } from '@/api/client'
import { fetchWithAuthRecovery } from '@/api/authorizedFetch'
import { isAddress } from 'viem'

export type ProtocolSettingsRegistryRow = {
  label: string
  value: string
}

export type ProtocolSettingsRegistryGroup = {
  contract: string
  rows: ProtocolSettingsRegistryRow[]
}

export type ProtocolSettingsState = {
  executionMode?: string
  admin?: string
  message?: string
  contracts?: Record<string, string>
  contractRegistry?: ProtocolSettingsRegistryGroup[]
  fundingPool: {
    minDeposit: string
    withdrawalRequestDurationSeconds: number
    withdrawalRequestGapSeconds: number
    payoutRouter: string
    allocator: string
    acceptedToken: string
    tradeCreditPool?: string
  }
  payoutRouter: {
    fundingPool: string
    allocator: string
    acceptedToken: string
    minRepayment: string
  }
  riskAllocator: {
    maxMerchantBps: number
    bankerYearDays: number
    maxTenorRateBps: number
    tiers?: Array<{
      id: number
      durationDays: number
      interestPercent: number
      active: boolean
    }>
  }
}

function authHeaders(accessToken: string | null | undefined): HeadersInit {
  const t = typeof accessToken === 'string' ? accessToken.trim() : ''
  if (!t) throw new Error('Missing access token for protocol settings API request.')
  const header = /^Token\s+\S+/i.test(t) ? t : `Token ${t}`
  return {
    Accept: 'application/json',
    Authorization: header,
  }
}

function jsonAuthHeaders(accessToken: string | null | undefined): HeadersInit {
  return {
    ...authHeaders(accessToken),
    'Content-Type': 'application/json',
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

function pickNumber(record: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const v = record[key]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v)
      if (Number.isFinite(n)) return n
    }
  }
  return 0
}

function normalizeContractRegistry(raw: unknown): ProtocolSettingsRegistryGroup[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const groups: ProtocolSettingsRegistryGroup[] = []
  for (const item of raw) {
    const group = asRecord(item)
    const contract = pickStr(group, 'contract')
    const rowsRaw = group.rows
    if (!contract || !Array.isArray(rowsRaw)) continue
    const rows: ProtocolSettingsRegistryRow[] = []
    for (const rowItem of rowsRaw) {
      const row = asRecord(rowItem)
      const label = pickStr(row, 'label')
      const value = pickStr(row, 'value')
      if (!label) continue
      rows.push({ label, value })
    }
    groups.push({ contract, rows })
  }
  return groups.length > 0 ? groups : undefined
}

function normalizeProtocolSettingsState(raw: unknown): ProtocolSettingsState {
  const r = asRecord(raw)
  const fundingPool = asRecord(r.fundingPool ?? r.funding_pool)
  const payoutRouter = asRecord(r.payoutRouter ?? r.payout_router)
  const riskAllocator = asRecord(
    r.riskAllocator ?? r.risk_allocator ?? r.allocationController ?? r.allocation_controller,
  )
  const contractsRaw = asRecord(r.contracts)

  const maxMerchantBps =
    pickNumber(riskAllocator, 'maxMerchantBps', 'max_merchant_bps') ||
    pickNumber(r, 'maxMerchantBps', 'max_merchant_bps')

  const tiersRaw = riskAllocator.tiers
  const tiers = Array.isArray(tiersRaw)
    ? tiersRaw
        .map((item) => {
          const t = asRecord(item)
          const id = pickNumber(t, 'id')
          if (!id) return null
          return {
            id,
            durationDays: pickNumber(t, 'durationDays', 'duration_days'),
            interestPercent: pickNumber(t, 'interestPercent', 'interest_percent'),
            active: Boolean(t.active ?? true),
          }
        })
        .filter((t): t is NonNullable<typeof t> => t != null)
    : undefined

  const contracts: Record<string, string> = {}
  for (const [key, value] of Object.entries(contractsRaw)) {
    if (typeof value === 'string' && value.trim()) contracts[key] = value.trim()
  }

  return {
    executionMode: pickStr(r, 'executionMode', 'execution_mode') || undefined,
    admin: pickStr(r, 'admin') || undefined,
    message: pickStr(r, 'message') || undefined,
    contracts: Object.keys(contracts).length > 0 ? contracts : undefined,
    contractRegistry: normalizeContractRegistry(r.contractRegistry ?? r.contract_registry),
    fundingPool: {
      minDeposit: pickStr(fundingPool, 'minDeposit', 'min_deposit'),
      withdrawalRequestDurationSeconds: pickNumber(
        fundingPool,
        'withdrawalRequestDurationSeconds',
        'withdrawal_request_duration_seconds',
      ),
      withdrawalRequestGapSeconds: pickNumber(
        fundingPool,
        'withdrawalRequestGapSeconds',
        'withdrawal_request_gap_seconds',
      ),
      payoutRouter: pickStr(fundingPool, 'payoutRouter', 'payout_router'),
      allocator: pickStr(fundingPool, 'allocator'),
      acceptedToken: pickStr(fundingPool, 'acceptedToken', 'accepted_token'),
      tradeCreditPool: pickStr(fundingPool, 'tradeCreditPool', 'trade_credit_pool') || undefined,
    },
    payoutRouter: {
      fundingPool: pickStr(payoutRouter, 'fundingPool', 'funding_pool'),
      allocator: pickStr(payoutRouter, 'allocator'),
      acceptedToken: pickStr(payoutRouter, 'acceptedToken', 'accepted_token'),
      minRepayment: pickStr(payoutRouter, 'minRepayment', 'min_repayment'),
    },
    riskAllocator: {
      maxMerchantBps,
      bankerYearDays: pickNumber(riskAllocator, 'bankerYearDays', 'banker_year_days'),
      maxTenorRateBps: pickNumber(riskAllocator, 'maxTenorRateBps', 'max_tenor_rate_bps'),
      tiers,
    },
  }
}

/** `GET /api/multisig/protocol-settings/` — on-chain protocol settings for admin panels. */
export async function fetchProtocolSettingsState(
  accessToken: string | null | undefined,
): Promise<ProtocolSettingsState> {
  const res = await fetchWithAuthRecovery(apiUrl('/multisig/protocol-settings/'), {
    method: 'GET',
    headers: authHeaders(accessToken),
  })
  const raw = await parseJsonResponse<unknown>(res)
  return normalizeProtocolSettingsState(raw)
}

function postProposal(
  accessToken: string | null | undefined,
  path: string,
  body: Record<string, unknown>,
  options?: { signal?: AbortSignal },
) {
  return fetchWithAuthRecovery(apiUrl(path), {
    method: 'POST',
    headers: jsonAuthHeaders(accessToken),
    body: JSON.stringify(body),
    signal: options?.signal,
  }).then((res) => parseAdminWriteResponse(res))
}

/** `POST /api/multisig/proposals/max-merchant-bps/` */
export function postMultisigCreateMaxMerchantBpsProposal(
  accessToken: string | null | undefined,
  maxMerchantBps: number,
  options?: { signal?: AbortSignal },
) {
  return postProposal(
    accessToken,
    '/multisig/proposals/max-merchant-bps/',
    { max_merchant_bps: maxMerchantBps },
    options,
  )
}

/** `POST /api/multisig/proposals/funding-pool-min-deposit/` */
export function postMultisigCreateFundingPoolMinDepositProposal(
  accessToken: string | null | undefined,
  minDeposit: string,
  options?: { signal?: AbortSignal },
) {
  return postProposal(
    accessToken,
    '/multisig/proposals/funding-pool-min-deposit/',
    { min_deposit: minDeposit },
    options,
  )
}

/** `POST /api/multisig/proposals/funding-pool-payout-router/` */
export function postMultisigCreateFundingPoolPayoutRouterProposal(
  accessToken: string | null | undefined,
  payoutRouter: string,
  options?: { signal?: AbortSignal },
) {
  return postProposal(
    accessToken,
    '/multisig/proposals/funding-pool-payout-router/',
    { payout_router: payoutRouter.trim() },
    options,
  )
}

/** `POST /api/multisig/proposals/payout-router-funding-pool/` */
export function postMultisigCreatePayoutRouterFundingPoolProposal(
  accessToken: string | null | undefined,
  fundingPool: string,
  options?: { signal?: AbortSignal },
) {
  return postProposal(
    accessToken,
    '/multisig/proposals/payout-router-funding-pool/',
    { funding_pool: fundingPool.trim() },
    options,
  )
}

/** `POST /api/multisig/proposals/payout-router-allocator/` */
export function postMultisigCreatePayoutRouterAllocatorProposal(
  accessToken: string | null | undefined,
  allocator: string,
  options?: { signal?: AbortSignal },
) {
  return postProposal(
    accessToken,
    '/multisig/proposals/payout-router-allocator/',
    { allocator: allocator.trim() },
    options,
  )
}

/** `POST /api/multisig/proposals/payout-router-accepted-token/` */
export function postMultisigCreatePayoutRouterAcceptedTokenProposal(
  accessToken: string | null | undefined,
  acceptedToken: string,
  options?: { signal?: AbortSignal },
) {
  return postProposal(
    accessToken,
    '/multisig/proposals/payout-router-accepted-token/',
    { accepted_token: acceptedToken.trim() },
    options,
  )
}

/** `POST /api/multisig/proposals/funding-pool-withdrawal-duration/` */
export function postMultisigCreateFundingPoolWithdrawalDurationProposal(
  accessToken: string | null | undefined,
  durationSeconds: number,
  options?: { signal?: AbortSignal },
) {
  return postProposal(
    accessToken,
    '/multisig/proposals/funding-pool-withdrawal-duration/',
    { duration_seconds: durationSeconds },
    options,
  )
}

/** `POST /api/multisig/proposals/funding-pool-withdrawal-gap/` */
export function postMultisigCreateFundingPoolWithdrawalGapProposal(
  accessToken: string | null | undefined,
  gapSeconds: number,
  options?: { signal?: AbortSignal },
) {
  return postProposal(
    accessToken,
    '/multisig/proposals/funding-pool-withdrawal-gap/',
    { gap_seconds: gapSeconds },
    options,
  )
}

/** `POST /api/multisig/proposals/allocation-banker-year-days/` */
export function postMultisigCreateAllocationBankerYearDaysProposal(
  accessToken: string | null | undefined,
  bankerYearDays: number,
  options?: { signal?: AbortSignal },
) {
  return postProposal(
    accessToken,
    '/multisig/proposals/allocation-banker-year-days/',
    { banker_year_days: bankerYearDays },
    options,
  )
}

/** `POST /api/multisig/proposals/allocation-max-tenor-rate-bps/` */
export function postMultisigCreateAllocationMaxTenorRateBpsProposal(
  accessToken: string | null | undefined,
  maxTenorRateBps: number,
  options?: { signal?: AbortSignal },
) {
  return postProposal(
    accessToken,
    '/multisig/proposals/allocation-max-tenor-rate-bps/',
    { max_tenor_rate_bps: maxTenorRateBps },
    options,
  )
}

/** `POST /api/multisig/proposals/payout-router-min-repayment/` */
export function postMultisigCreatePayoutRouterMinRepaymentProposal(
  accessToken: string | null | undefined,
  minRepayment: string,
  options?: { signal?: AbortSignal },
) {
  return postProposal(
    accessToken,
    '/multisig/proposals/payout-router-min-repayment/',
    { min_repayment: minRepayment.trim() },
    options,
  )
}

export function secondsToHumanDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return `${seconds} seconds`
  if (seconds % 86400 === 0) return `${seconds / 86400} days`
  if (seconds % 3600 === 0) return `${seconds / 3600} hours`
  if (seconds % 60 === 0) return `${seconds / 60} minutes`
  return `${seconds} seconds`
}

export function assertValidWithdrawalDurationSeconds(seconds: number): void {
  if (!Number.isInteger(seconds) || seconds < 3600 || seconds > 2592000) {
    throw new Error('Withdrawal duration must be between 3,600 and 2,592,000 seconds (1 hour to 30 days).')
  }
}

export function assertValidWithdrawalGapSeconds(seconds: number): void {
  if (!Number.isInteger(seconds) || seconds < 60 || seconds > 86400) {
    throw new Error('Withdrawal gap must be between 60 and 86,400 seconds (1 minute to 1 day).')
  }
}

export function assertValidBankerYearDays(days: number): void {
  if (!Number.isInteger(days) || days < 360 || days > 366) {
    throw new Error('Banker year days must be between 360 and 366.')
  }
}

export function assertValidMaxTenorRateBps(bps: number): void {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
    throw new Error('Max tenor rate must be between 0% and 100%.')
  }
}

export function assertValidMaxMerchantBps(bps: number): void {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
    throw new Error('Max merchant concentration must be between 0% and 100%.')
  }
}

/** Map on-chain bps to a display percent string; falls back when GET returns 0 / missing. */
export function resolveMaxMerchantPercentFromBps(
  maxMerchantBps: number,
  fallbackPercent = '50',
): string {
  if (!Number.isFinite(maxMerchantBps) || maxMerchantBps <= 0) {
    return fallbackPercent
  }
  return bpsToPercent(maxMerchantBps)
}

export function percentValuesEqual(a: string, b: string): boolean {
  const aBps = percentToBps(a)
  const bBps = percentToBps(b)
  if (!Number.isFinite(aBps) || !Number.isFinite(bBps)) return a.trim() === b.trim()
  return aBps === bBps
}

export function percentToBps(percent: string): number {
  const n = Number(percent)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

export function bpsToPercent(bps: number): string {
  if (!Number.isFinite(bps)) return '0'
  const pct = bps / 100
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/\.?0+$/, '')
}

export function addressesEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export function isValidEthAddress(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length > 0 && isAddress(trimmed, { strict: false })
}

export function normalizeTokenAmount(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return trimmed
  return String(n)
}

export function tokenAmountsEqual(a: string, b: string): boolean {
  const na = normalizeTokenAmount(a)
  const nb = normalizeTokenAmount(b)
  if (!na || !nb) return na === nb
  const aNum = Number(na)
  const bNum = Number(nb)
  if (Number.isFinite(aNum) && Number.isFinite(bNum)) return aNum === bNum
  return na === nb
}

export function assertValidEthAddress(value: string, label: string): void {
  if (!isValidEthAddress(value)) {
    throw new Error(`${label} must be a valid Ethereum address.`)
  }
}

export function assertValidTokenAmount(value: string, label: string): void {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${label} is required.`)
  }
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${label} must be a non-negative number.`)
  }
}
