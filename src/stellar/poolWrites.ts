import { fistUsdToStroops } from '@/stellar/reads'
import {
  attestationRegistryId,
  invokeSorobanWithWallet,
  randomOpIdBytes,
  tradeCreditPoolId,
} from '@/stellar/sorobanInvoke'

/**
 * Deposit FISTUSD into TradeCreditPool via Soroban (investor must be allowlisted).
 */
export async function depositToTradeCreditPool(params: {
  investor: string
  amountHuman: number
}): Promise<{ hash: string }> {
  const investor = params.investor.trim().toUpperCase()
  const amount = fistUsdToStroops(params.amountHuman)
  if (amount <= 0n) throw new Error('Deposit amount must be greater than zero.')

  return invokeSorobanWithWallet({
    contractId: tradeCreditPoolId(),
    method: 'deposit',
    source: investor,
    args: [
      { type: 'address', value: investor },
      { type: 'i128', value: amount },
      { type: 'bytes', value: randomOpIdBytes() },
    ],
  })
}

/**
 * Redeem pool units back to FISTUSD (1:1). Investor signs.
 */
export async function redeemFromTradeCreditPool(params: {
  investor: string
  amountHuman: number
}): Promise<{ hash: string }> {
  const investor = params.investor.trim().toUpperCase()
  const units = fistUsdToStroops(params.amountHuman)
  if (units <= 0n) throw new Error('Withdraw amount must be greater than zero.')

  return invokeSorobanWithWallet({
    contractId: tradeCreditPoolId(),
    method: 'redeem',
    source: investor,
    args: [
      { type: 'address', value: investor },
      { type: 'i128', value: units },
      { type: 'bytes', value: randomOpIdBytes() },
    ],
  })
}

/**
 * Admin allowlist an investor on TradeCreditPool.
 *
 * After FistMultisig handoff the pool admin is a C-address — Freighter cannot
 * sign as that contract. Prefer the backend KYC approve path (creates/executes
 * a FistMultisig proposal). This helper only works pre-handoff when a G-admin
 * still holds the Admin role.
 */
export async function setInvestorApprovedOnPool(params: {
  admin: string
  investor: string
  approved?: boolean
}): Promise<{ hash: string }> {
  const admin = params.admin.trim().toUpperCase()
  const investor = params.investor.trim().toUpperCase()
  const approved = params.approved !== false
  if (admin.startsWith('C')) {
    throw new Error(
      'Pool admin is FistMultisig after handoff. Approve the investor via admin KYC (backend), not a direct wallet call.',
    )
  }

  return invokeSorobanWithWallet({
    contractId: tradeCreditPoolId(),
    method: 'set_investor_status',
    source: admin,
    args: [
      { type: 'address', value: investor },
      { type: 'bool', value: approved },
    ],
  })
}

/**
 * Merchant (or any payer) repays a funded receivable.
 */
export async function repayTradeCreditReceivable(params: {
  payer: string
  receivableId: string
  amountHuman: number
}): Promise<{ hash: string }> {
  const payer = params.payer.trim().toUpperCase()
  const receivableId = params.receivableId.trim()
  const amount = fistUsdToStroops(params.amountHuman)
  if (!receivableId) throw new Error('Missing receivable id.')
  if (amount <= 0n) throw new Error('Repayment amount must be greater than zero.')

  return invokeSorobanWithWallet({
    contractId: tradeCreditPoolId(),
    method: 'repay',
    source: payer,
    args: [
      { type: 'string', value: receivableId },
      { type: 'address', value: payer },
      { type: 'i128', value: amount },
      { type: 'bytes', value: randomOpIdBytes() },
    ],
  })
}

/**
 * Originator registers a receivable (usually admin wallet on Track A).
 * Post-handoff Originator is FistMultisig — use `POST /api/loan/request` instead.
 */
export async function registerTradeCreditReceivable(params: {
  originator: string
  receivableId: string
  merchantId: string
  merchantPayoutAddress: string
  advanceAmountHuman: number
  repaymentAmountHuman: number
  maturityTimestamp: number
}): Promise<{ hash: string }> {
  const originator = params.originator.trim().toUpperCase()
  if (originator.startsWith('C')) {
    throw new Error(
      'Originator is FistMultisig after handoff. Submit loans via POST /api/loan/request.',
    )
  }
  const advance = fistUsdToStroops(params.advanceAmountHuman)
  const repayment = fistUsdToStroops(params.repaymentAmountHuman)
  if (advance <= 0n) throw new Error('Advance amount must be greater than zero.')
  if (repayment < advance) throw new Error('Repayment must be >= advance.')

  return invokeSorobanWithWallet({
    contractId: tradeCreditPoolId(),
    method: 'register_receivable',
    source: originator,
    args: [
      { type: 'string', value: params.receivableId.trim() },
      { type: 'string', value: params.merchantId.trim() },
      { type: 'address', value: params.merchantPayoutAddress.trim().toUpperCase() },
      { type: 'i128', value: advance },
      { type: 'i128', value: repayment },
      { type: 'u64', value: params.maturityTimestamp },
    ],
  })
}

/** Post-handoff RiskManager is FistMultisig — use admin loan verify API instead. */
export async function approveTradeCreditReceivable(params: {
  riskManager: string
  receivableId: string
}): Promise<{ hash: string }> {
  const riskManager = params.riskManager.trim().toUpperCase()
  if (riskManager.startsWith('C')) {
    throw new Error(
      'RiskManager is FistMultisig after handoff. Approve via admin loan verify.',
    )
  }
  return invokeSorobanWithWallet({
    contractId: tradeCreditPoolId(),
    method: 'approve_receivable',
    source: riskManager,
    args: [{ type: 'string', value: params.receivableId.trim() }],
  })
}

/** Post-handoff PoolManager is FistMultisig — use admin fund / governance execute. */
export async function fundTradeCreditReceivable(params: {
  poolManager: string
  receivableId: string
}): Promise<{ hash: string }> {
  const poolManager = params.poolManager.trim().toUpperCase()
  if (poolManager.startsWith('C')) {
    throw new Error(
      'PoolManager is FistMultisig after handoff. Fund via admin fund / multisig execute.',
    )
  }
  return invokeSorobanWithWallet({
    contractId: tradeCreditPoolId(),
    method: 'fund_receivable',
    source: poolManager,
    args: [
      { type: 'string', value: params.receivableId.trim() },
      { type: 'bytes', value: randomOpIdBytes() },
    ],
  })
}

/**
 * AttestationType: 1 = MerchantApproved, 2 = DocumentsVerified.
 * `issuer` must be an authorized AttestationRegistry issuer (FISTUSD issuer on Testnet),
 * not the pool admin.
 */
export async function issueAttestation(params: {
  issuer: string
  subjectIdHex: string
  attestationType: 1 | 2
  evidenceCommitmentHex?: string
  expiresAt?: number
}): Promise<{ hash: string }> {
  const issuer = params.issuer.trim().toUpperCase()
  const subject = hexToBytes32(params.subjectIdHex)
  const evidence = hexToBytes32(params.evidenceCommitmentHex ?? randomHex(32))
  const expiresAt =
    params.expiresAt ?? Math.floor(Date.now() / 1000) + 86400 * 365

  return invokeSorobanWithWallet({
    contractId: attestationRegistryId(),
    method: 'issue_attestation',
    source: issuer,
    args: [
      { type: 'address', value: issuer },
      { type: 'bytes', value: subject },
      { type: 'u32', value: params.attestationType },
      { type: 'bytes', value: evidence },
      { type: 'u64', value: expiresAt },
    ],
  })
}

function randomHex(byteLen: number): string {
  const bytes = new Uint8Array(byteLen)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes32(hex: string): Uint8Array {
  const clean = hex.trim().replace(/^0x/i, '')
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length !== 64) {
    throw new Error('Expected 32-byte hex string')
  }
  const out = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}
