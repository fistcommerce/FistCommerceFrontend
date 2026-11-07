import type { AppErrorCode } from '@/errors/codes'
import { messageForCode } from '@/errors/messages'
import { getSorobanDeployment } from '@/stellar/deployment'

/**
 * TradeCreditPool `Error` discriminants (contracts/trade-credit-pool).
 * AttestationRegistry reuses some numeric codes with different meanings —
 * disambiguate via contract id / method name when present in the RPC dump.
 */
const POOL_ERROR_BY_CODE: Record<number, AppErrorCode> = {
  1: 'STELLAR_ALREADY_INITIALIZED',
  2: 'STELLAR_NOT_INITIALIZED',
  3: 'STELLAR_UNAUTHORIZED',
  4: 'STELLAR_INVESTOR_NOT_APPROVED',
  5: 'STELLAR_INVALID_AMOUNT',
  6: 'STELLAR_OP_REUSED',
  7: 'STELLAR_RECEIVABLE_EXISTS',
  8: 'STELLAR_RECEIVABLE_NOT_FOUND',
  9: 'STELLAR_INVALID_ECONOMICS',
  10: 'STELLAR_INVALID_STATUS',
  11: 'STELLAR_MATURITY_NOT_FUTURE',
  12: 'STELLAR_ATTESTATION_MISSING',
  13: 'POOL_ILLIQUID',
  14: 'STELLAR_OVER_REPAYMENT',
  15: 'STELLAR_TRANSFER_FAILED',
}

const REGISTRY_ERROR_BY_CODE: Record<number, AppErrorCode> = {
  1: 'STELLAR_ALREADY_INITIALIZED',
  2: 'STELLAR_NOT_INITIALIZED',
  3: 'STELLAR_UNAUTHORIZED',
  4: 'STELLAR_ISSUER_NOT_AUTHORIZED',
  5: 'STELLAR_RECEIVABLE_NOT_FOUND',
  6: 'STELLAR_INVALID_STATUS',
  7: 'STELLAR_INVALID_AMOUNT',
}

export type SorobanClassified = {
  code: AppErrorCode
  message: string
  raw: string
  contractErrorCode: number
}

function poolContractId(): string {
  try {
    return getSorobanDeployment().trade_credit_pool.contract_id.trim().toUpperCase()
  } catch {
    return ''
  }
}

function registryContractId(): string {
  try {
    return getSorobanDeployment().attestation_registry.contract_id.trim().toUpperCase()
  } catch {
    return ''
  }
}

function extractContractErrorCode(text: string): number | null {
  const patterns = [
    /Error\(Contract,\s*#(\d+)\)/i,
    /ScErrorType::Contract[^\d]*(\d+)/i,
    /"contract":\s*"#?(\d+)"/i,
    /HostError:[^\n]*#(\d+)/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m?.[1]) {
      const n = Number.parseInt(m[1], 10)
      if (Number.isFinite(n)) return n
    }
  }
  return null
}

type ContractKind = 'pool' | 'registry' | 'unknown'

function detectContractKind(text: string): ContractKind {
  const upper = text.toUpperCase()
  const poolId = poolContractId()
  const registryId = registryContractId()
  if (poolId && upper.includes(poolId)) return 'pool'
  if (registryId && upper.includes(registryId)) return 'registry'

  if (
    /,\s*deposit\]|,\s*redeem\]|,\s*repay\]|,\s*fund_receivable\]|,\s*approve_receivable\]|,\s*register_receivable\]|,\s*set_investor_status\]/i.test(
      text,
    )
  ) {
    return 'pool'
  }
  if (/,\s*issue_attestation\]|,\s*authorize_issuer\]|,\s*is_attestation_valid\]/i.test(text)) {
    return 'registry'
  }
  return 'unknown'
}

function mapCode(kind: ContractKind, n: number): AppErrorCode {
  if (kind === 'registry') {
    return REGISTRY_ERROR_BY_CODE[n] ?? 'STELLAR_CONTRACT_ERROR'
  }
  // Prefer pool mapping for invest/withdraw/repay dumps and unknown HostErrors.
  return POOL_ERROR_BY_CODE[n] ?? 'STELLAR_CONTRACT_ERROR'
}

function messageForSorobanCode(code: AppErrorCode, n: number): string {
  if (code === 'STELLAR_CONTRACT_ERROR') {
    return `The Stellar contract rejected this action (error #${n}). Try again or contact support.`
  }
  return messageForCode(code)
}

/**
 * Map Soroban / HostError simulation dumps to stable app error codes.
 * Returns null when the text is not a Stellar contract error.
 */
export function classifySorobanErrorText(text: string): SorobanClassified | null {
  const raw = text.trim()
  if (!raw) return null

  const looksSoroban =
    /HostError|Error\(Contract|soroban|simulateTransaction|fn_call|ScErrorType/i.test(raw) ||
    /CABUICVV|CDALKH7|CBUXXEVZ|CDH2LQC4|TradeCreditPool|AttestationRegistry/i.test(raw)
  if (!looksSoroban && !/Error\(Contract,\s*#\d+\)/i.test(raw)) return null

  const n = extractContractErrorCode(raw)
  if (n == null) {
    if (/HostError|simulateTransaction failed|Soroban/i.test(raw)) {
      return {
        code: 'STELLAR_CONTRACT_ERROR',
        message: messageForCode('STELLAR_CONTRACT_ERROR'),
        raw,
        contractErrorCode: -1,
      }
    }
    return null
  }

  const kind = detectContractKind(raw)
  const code = mapCode(kind, n)
  return {
    code,
    message: messageForSorobanCode(code, n),
    raw,
    contractErrorCode: n,
  }
}

/** Flatten nested SDK / RPC failure objects into text for classification. */
export function stringifySorobanFailure(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) {
    const extras: string[] = [error.message]
    const rec = error as Error & {
      response?: unknown
      data?: unknown
      result?: unknown
      errorResult?: unknown
    }
    for (const key of ['response', 'data', 'result', 'errorResult'] as const) {
      const v = rec[key]
      if (v == null) continue
      try {
        extras.push(typeof v === 'string' ? v : JSON.stringify(v))
      } catch {
        /* ignore */
      }
    }
    return extras.filter(Boolean).join('\n')
  }
  if (error && typeof error === 'object') {
    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  }
  return String(error ?? '')
}
