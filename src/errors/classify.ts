import { ApiRequestError } from '@/api/apiRequestError'
import type { AppErrorCode } from '@/errors/codes'
import { messageForCode } from '@/errors/messages'
import { isUserRejectedWalletRequest, WalletChainSwitchError } from '@/wallet/walletChainErrors'

export type AppErrorContext =
  | 'general'
  | 'governance_sign'
  | 'governance_execute'
  | 'invest'
  | 'withdraw'
  | 'repay'
  | 'kyc'
  | 'onboarding'
  | 'mint'

export type ClassifiedAppError = {
  code: AppErrorCode
  /** Preferred user-facing text (may include API field details). */
  message: string
  /** Original text used for classification (for logging). */
  raw: string
}

const API_CODE_BY_RESPONSE: Partial<Record<string, AppErrorCode>> = {
  MULTISIG_EXECUTE_IN_PROGRESS: 'MULTISIG_EXECUTE_IN_PROGRESS',
  MULTISIG_EXECUTE_QUEUED: 'MULTISIG_EXECUTE_QUEUED',
  EXECUTE_QUEUE_JUMP_ACK_REQUIRED: 'EXECUTE_QUEUE_JUMP_ACK_REQUIRED',
  MULTISIG_RESIGN_REQUIRED: 'MULTISIG_RESIGN_REQUIRED',
  MULTISIG_STALE_NONCE: 'MULTISIG_STALE_NONCE',
  PAYOUT_NOT_CONFIRMED_ON_CHAIN: 'PAYOUT_NOT_CONFIRMED_ON_CHAIN',
  FUND_NOT_CONFIRMED_ON_CHAIN: 'FUND_NOT_CONFIRMED_ON_CHAIN',
  REJECT_NOT_CONFIRMED_ON_CHAIN: 'REJECT_NOT_CONFIRMED_ON_CHAIN',
  REPAYMENT_NOT_CONFIRMED_ON_CHAIN: 'REPAYMENT_NOT_CONFIRMED_ON_CHAIN',
}

function pickTrimmedString(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

/**
 * Collect candidate strings from a viem/wallet error tree.
 * Outer wrappers (EstimateGasExecutionError) often hide the real revert in
 * `shortMessage`, `details`, or nested `cause`.
 */
function collectErrorTextCandidates(error: unknown, depth = 0): string[] {
  if (depth > 8) return []
  if (typeof error === 'string') {
    const t = error.trim()
    return t ? [t] : []
  }
  if (!error || typeof error !== 'object') return []

  const rec = error as Record<string, unknown>
  const out: string[] = []
  for (const key of ['shortMessage', 'details', 'message', 'reason', 'data'] as const) {
    const v = pickTrimmedString(rec[key])
    if (v) out.push(v)
  }
  if (Array.isArray(rec.metaMessages)) {
    for (const item of rec.metaMessages) {
      const v = pickTrimmedString(item)
      if (v) out.push(v)
    }
  }
  if (error instanceof Error && error.message.trim()) {
    out.push(error.message.trim())
  }
  if ('cause' in rec && rec.cause != null) {
    out.push(...collectErrorTextCandidates(rec.cause, depth + 1))
  }
  return out
}

function isGasEstimateWrapperText(text: string): boolean {
  return /estimat(?:e|ion)\s+gas|EstimateGasExecutionError|gas required exceeds allowance|cannot estimate gas/i.test(
    text,
  )
}

/** Prefer nested revert / domain reasons over outer gas-estimate wrappers. */
function scoreErrorCandidate(text: string): number {
  let score = 0
  if (/execution reverted|reverted with|custom error/i.test(text)) score += 40
  if (/DepositsPaused|WithdrawalsPaused|FundingPaused|insufficient|allowance|concentration|kyc|illiquid|inactive request/i.test(text))
    score += 30
  if (isGasEstimateWrapperText(text)) score -= 50
  if (/ContractFunction|Request Arguments|Docs:|Version:|viem@/i.test(text)) score -= 20
  if (text.length > 400) score -= 10
  if (text.length > 0 && text.length < 180) score += 5
  return score
}

function rawText(error: unknown): string {
  if (typeof error === 'string') return error.trim()
  const candidates = collectErrorTextCandidates(error)
  if (!candidates.length) {
    if (error instanceof Error) return error.message.trim()
    return ''
  }
  const unique = [...new Set(candidates)]
  unique.sort((a, b) => scoreErrorCandidate(b) - scoreErrorCandidate(a))
  // Prefer the best-scoring snippet; fall back to joining top candidates for classification.
  const best = unique[0]!
  if (unique.length === 1) return best
  // Include a few high-scoring siblings so classifyFromText can still match paused / revert patterns.
  const top = unique.slice(0, 4).join('\n')
  return top
}

function looksTechnical(msg: string): boolean {
  if (/0x[a-fA-F0-9]{40,}/.test(msg)) return true
  if (/ContractFunction|Request Arguments|AbiEncoding|TransactionExecutionError|InternalRpcError|EstimateGasExecutionError/i.test(msg))
    return true
  if (/signTypedData|eth_sign|wallet_switchEthereumChain/i.test(msg) && msg.length > 120) return true
  if (msg.length > 500) return true
  return false
}

function clipped(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, max - 1).trim()}…`
}

function humanizeRevertToken(s: string): string {
  return s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Decode ASCII from hex blobs like `41413234…` when present in AA errors. */
function decodeEmbeddedAsciiHex(text: string): string | null {
  const match = text.match(/([0-9a-fA-F]{16,})/)
  if (!match) return null
  const hex = match[1]!
  if (hex.length % 2 !== 0) return null
  try {
    let out = ''
    for (let i = 0; i < hex.length; i += 2) {
      const code = Number.parseInt(hex.slice(i, i + 2), 16)
      if (code < 32 || code > 126) {
        if (code === 0) continue
        return out.trim() || null
      }
      out += String.fromCharCode(code)
    }
    const trimmed = out.trim()
    return trimmed.length >= 4 ? trimmed : null
  } catch {
    return null
  }
}

function stripHexNoise(text: string): string {
  return text
    .replace(/0x[a-fA-F0-9]{64,}/g, '')
    .replace(/\('[0-9a-fA-F]{20,}'(?:,\s*'[0-9a-fA-F]{20,}')*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** RPC / viem phrasing for “not enough native gas (ETH or USDC)” on the *caller* wallet. */
function isInsufficientNativeGasText(text: string): boolean {
  // Prefer domain reverts over outer estimate-gas / insufficient-funds wrappers.
  if (
    /execution reverted|reverted with (?:reason|custom error)|DepositsPaused|WithdrawalsPaused|FundingPaused|concentration|allowance/i.test(
      text,
    ) &&
    !/insufficient funds for (?:gas|intrinsic)/i.test(text)
  ) {
    return false
  }
  return (
    /insufficient funds(?:\s+for\s+(?:gas|intrinsic))?/i.test(text) ||
    /not enough (?:ETH|USDC|native(?:\s+token)?).*(?:gas|fee|transaction)/i.test(text) ||
    /(?:gas|fee|transaction).*(?:not enough|insufficient).*(?:ETH|USDC|native)/i.test(text)
  )
}

/** ERC-4337 prefund / deposit failures — not the end-user EOA signing the outer tx. */
function isAccountPrefundGasText(text: string): boolean {
  return /AA21|didn'?t pay prefund|did not pay prefund|missingAccountFunds/i.test(text)
}

/**
 * Backend-relayed actions fail when the *servicer* (or related ops wallet) cannot pay gas.
 * Prefer this over blaming the end-user wallet.
 */
function isServicerInsufficientNativeText(text: string): boolean {
  if (
    !isInsufficientNativeGasText(text) &&
    !isAccountPrefundGasText(text) &&
    !/low(?:\s+|_ )?balance|gas\s+warning/i.test(text)
  ) {
    return false
  }
  return /servicer|relay(?:er)?|ops wallet|protocol wallet/i.test(text)
}

function isGovernanceContext(context: AppErrorContext): boolean {
  return context === 'governance_sign' || context === 'governance_execute'
}

function codeResult(code: AppErrorCode, raw: string): ClassifiedAppError {
  return { code, message: messageForCode(code), raw }
}

/** Multisig / EntryPoint / proposal-queue errors — governance contexts only. */
function classifyGovernanceFromText(t: string, context: AppErrorContext): ClassifiedAppError | null {
  if (/AA24|signature error/i.test(t)) {
    return codeResult('EXEC_SIM_AA24', t)
  }
  if (/AA25|invalid account nonce/i.test(t)) {
    return codeResult('MULTISIG_STALE_NONCE', t)
  }
  if (/Frozen UserOp nonce .* stale|nonce drifted before submit|on-chain nonce is/i.test(t)) {
    return codeResult('MULTISIG_STALE_NONCE', t)
  }
  if (/another multisig execution is in progress|MULTISIG_EXECUTE_IN_PROGRESS/i.test(t)) {
    return codeResult('MULTISIG_EXECUTE_IN_PROGRESS', t)
  }
  if (/MULTISIG_RESIGN_REQUIRED|must sign again before executing|signatures were cleared/i.test(t)) {
    return codeResult('MULTISIG_RESIGN_REQUIRED', t)
  }
  if (/EXECUTE_QUEUE_JUMP_ACK_REQUIRED|queue jump acknowledgement|skip earlier open proposals/i.test(t)) {
    return codeResult('EXECUTE_QUEUE_JUMP_ACK_REQUIRED', t)
  }
  if (/MULTISIG_EXECUTE_QUEUED|queued at nonce|execute earlier proposals first/i.test(t)) {
    return codeResult('MULTISIG_EXECUTE_QUEUED', t)
  }
  if (/EntryPoint handleOps simulation failed|handleOps simulation failed/i.test(t)) {
    const decoded = decodeEmbeddedAsciiHex(t)
    if (decoded && /AA24|signature/i.test(decoded)) {
      return codeResult('EXEC_SIM_AA24', t)
    }
    return codeResult('EXEC_SIM_FAILED', t)
  }

  if (
    /missing required EIP-712 typedData|typedData is incomplete/i.test(t) ||
    (context === 'governance_sign' && /signing payload.*missing/i.test(t))
  ) {
    return codeResult('SIGN_PAYLOAD_MISSING', t)
  }
  if (
    /typedData domain\.|verifyingContract|userOpHashToSign|primaryType must be/i.test(t) ||
    /does not match (payload chainId|multisigAddress|userOpHashToSign)/i.test(t)
  ) {
    return codeResult('SIGN_PAYLOAD_MISMATCH', t)
  }
  if (/Wallet could not EIP-712-sign|signTypedData/i.test(t)) {
    if (/user rejected|denied|cancelled|canceled/i.test(t)) {
      return codeResult('WALLET_REJECTED', t)
    }
    return codeResult('SIGN_TYPED_DATA_FAILED', t)
  }

  if (
    /Execution payload response was missing required fields/i.test(t) ||
    /execution data from the server is incomplete/i.test(t)
  ) {
    return codeResult('EXEC_PAYLOAD_MALFORMED', t)
  }
  if (/EntryPoint handleOps transaction reverted/i.test(t)) {
    return codeResult('EXEC_TX_REVERTED', t)
  }
  if (
    /MULTISIG_ALREADY_EXECUTED_ON_CHAIN|already succeeded on-chain|do not submit another handleOps/i.test(
      t,
    )
  ) {
    return codeResult('MULTISIG_ALREADY_EXECUTED_ON_CHAIN', t)
  }
  if (
    /mined on-chain, but (the server could not confirm|confirmation failed)|Confirm transaction|EXEC_CONFIRM_PENDING/i.test(
      t,
    )
  ) {
    return codeResult('EXEC_CONFIRM_PENDING', t)
  }
  if (/confirm-execute|couldn.?t confirm/i.test(t) && context === 'governance_execute') {
    return codeResult('EXEC_CONFIRM_FAILED', t)
  }

  if (/must match the wallet used for this admin login|Reconnect the wallet used/i.test(t)) {
    return codeResult('SESSION_WALLET_MISMATCH', t)
  }
  if (/not (an on-chain )?multisig (signer|owner)/i.test(t)) {
    return codeResult('NOT_MULTISIG_OWNER', t)
  }

  return null
}

/**
 * Normal user wallet / contract writes — never surfaces proposal / Restart signatures copy.
 */
function classifyUserTxFromText(t: string): ClassifiedAppError | null {
  if (/AA25|invalid account nonce/i.test(t)) {
    return codeResult('WALLET_NONCE_CONFLICT', t)
  }
  // Nonce-ish wallet failures that are not ERC-4337 proposal queue language.
  if (
    /nonce too (?:low|high)|replacement transaction underpriced|already known|Frozen UserOp nonce|nonce drifted before submit/i.test(
      t,
    )
  ) {
    return codeResult('WALLET_NONCE_CONFLICT', t)
  }

  // Explicit FundingPool / product reverts (before generic CONTRACT_REVERT humanize).
  if (/\billiquid\b/i.test(t)) {
    return codeResult('POOL_ILLIQUID', t)
  }
  if (
    /inactive request|already executed|request not found|already approved|you must wait .* between requests/i.test(
      t,
    )
  ) {
    return codeResult('WITHDRAWAL_INACTIVE', t)
  }

  // Ignore governance/UserOp fingerprints in user-tx context (fall through to shared mapping).
  if (
    /MULTISIG_|EXECUTE_QUEUE_JUMP|EntryPoint handleOps|userOpHashToSign|Frozen UserOp nonce|queued at nonce|execute earlier proposals|Restart signatures/i.test(
      t,
    )
  ) {
    return null
  }

  return null
}

/** Shared wallet / protocol / gas / revert parsing for both tracks. */
function classifySharedFromText(t: string): ClassifiedAppError | null {
  if (/user rejected|user denied|rejected the request|ACTION_REJECTED|4001|cancelled the request in your wallet/i.test(t)) {
    return codeResult('WALLET_REJECTED', t)
  }

  if (/deposits?[\s_]*paused|DepositsPaused/i.test(t)) {
    return codeResult('DEPOSITS_PAUSED', t)
  }
  if (/withdrawals?[\s_]*paused|WithdrawalsPaused/i.test(t)) {
    return codeResult('WITHDRAWALS_PAUSED', t)
  }
  if (/funding[\s_]*paused|FundingPaused/i.test(t)) {
    return codeResult('FUNDING_PAUSED', t)
  }
  if (/\bpaused\b/i.test(t) && /protocol|controller/i.test(t)) {
    return codeResult('PROTOCOL_PAUSED', t)
  }
  if (/max.?merchant|merchant.?concentration|concentration.?limit|setMaxMerchantBps/i.test(t)) {
    return codeResult('MERCHANT_CONCENTRATION', t)
  }
  if (/kyc.*(required|incomplete|not verified)|complete.*(kyc|identity|verification)/i.test(t)) {
    return codeResult('KYC_REQUIRED', t)
  }
  if (/insufficient allowance|exceeds allowance|approve tokens/i.test(t)) {
    return codeResult('ALLOWANCE_REQUIRED', t)
  }
  if (/transfer amount exceeds balance|insufficient token balance/i.test(t)) {
    return codeResult('INSUFFICIENT_TOKEN', t)
  }

  // Prefer named product reverts even when wrapped as "execution reverted: …"
  if (/\billiquid\b/i.test(t)) {
    return codeResult('POOL_ILLIQUID', t)
  }
  if (/inactive request|already executed/i.test(t)) {
    return codeResult('WITHDRAWAL_INACTIVE', t)
  }

  const quoted = t.match(/execution reverted:\s*"([^"]+)"/i)?.[1]?.trim()
  if (quoted) {
    const named = classifyUserTxFromText(quoted) ?? classifyUserTxFromText(`execution reverted: ${quoted}`)
    if (named && (named.code === 'POOL_ILLIQUID' || named.code === 'WITHDRAWAL_INACTIVE')) {
      return { ...named, raw: t }
    }
    return {
      code: 'CONTRACT_REVERT',
      message: clipped(humanizeRevertToken(quoted), 220),
      raw: t,
    }
  }
  const reason = t.match(/reverted with the following reason:\s*([^\n.]+)/i)?.[1]?.trim()
  if (reason) {
    if (/\billiquid\b/i.test(reason)) return codeResult('POOL_ILLIQUID', t)
    if (/inactive request|already executed/i.test(reason)) return codeResult('WITHDRAWAL_INACTIVE', t)
    return {
      code: 'CONTRACT_REVERT',
      message: clipped(humanizeRevertToken(reason), 220),
      raw: t,
    }
  }
  const reasonString = t.match(/reverted with reason string\s+'([^']+)'/i)?.[1]?.trim()
  if (reasonString) {
    if (/\billiquid\b/i.test(reasonString)) return codeResult('POOL_ILLIQUID', t)
    if (/inactive request|already executed/i.test(reasonString)) {
      return codeResult('WITHDRAWAL_INACTIVE', t)
    }
    return {
      code: 'CONTRACT_REVERT',
      message: clipped(humanizeRevertToken(reasonString), 220),
      raw: t,
    }
  }
  const customError = t.match(/reverted with custom error ['"]?([A-Za-z0-9_]+)/i)?.[1]?.trim()
  if (customError) {
    return {
      code: 'CONTRACT_REVERT',
      message: clipped(humanizeRevertToken(customError), 220),
      raw: t,
    }
  }

  if (isServicerInsufficientNativeText(t) || isAccountPrefundGasText(t)) {
    return codeResult('SERVICER_INSUFFICIENT_NATIVE', t)
  }
  if (/Fund this Circle wallet with Arc Testnet USDC/i.test(t) || /CIRCLE_ARC_GAS/i.test(t)) {
    return codeResult('CIRCLE_ARC_GAS', t)
  }
  if (isInsufficientNativeGasText(t)) {
    return codeResult('INSUFFICIENT_NATIVE', t)
  }
  if (/max fee per gas less than block base fee/i.test(t)) {
    return codeResult('GAS_PRICE_STALE', t)
  }
  if (/^request failed \(\d+\)$/i.test(t) || /^(bad request|unauthorized|forbidden|not found)$/i.test(t)) {
    return codeResult('API_MESSAGE', t)
  }

  if (/Network switch .* was cancelled/i.test(t)) {
    return { code: 'CHAIN_SWITCH_REJECTED', message: t, raw: t }
  }
  if (/Could not switch/i.test(t)) {
    return { code: 'CHAIN_SWITCH_FAILED', message: t, raw: t }
  }

  if (isGasEstimateWrapperText(t)) {
    const cleaned = stripHexNoise(t)
      .replace(/EstimateGasExecutionError:?/gi, '')
      .replace(/Docs:.*$/gim, '')
      .replace(/Version:.*$/gim, '')
      .replace(/Request Arguments:[\s\S]*$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (cleaned && !looksTechnical(cleaned) && cleaned.length >= 8) {
      if (/\billiquid\b/i.test(cleaned)) return codeResult('POOL_ILLIQUID', t)
      if (/inactive request|already executed/i.test(cleaned)) {
        return codeResult('WITHDRAWAL_INACTIVE', t)
      }
      return { code: 'CONTRACT_REVERT', message: clipped(cleaned, 220), raw: t }
    }
  }

  return null
}

function classifyFromText(text: string, context: AppErrorContext): ClassifiedAppError | null {
  const t = text.trim()
  if (!t) return null

  if (isGovernanceContext(context)) {
    const gov = classifyGovernanceFromText(t, context)
    if (gov) return gov
  } else {
    const user = classifyUserTxFromText(t)
    if (user) return user
  }

  return classifySharedFromText(t)
}

function classifyApiRequestError(error: ApiRequestError): ClassifiedAppError {
  const raw = [error.message, ...error.detailLines].filter(Boolean).join('\n').trim()
  if (error.apiCode) {
    const mapped = API_CODE_BY_RESPONSE[error.apiCode]
    if (mapped) {
      return { code: mapped, message: messageForCode(mapped), raw }
    }
  }
  // HTTP APIs that hit the chain use the servicer (loan request, repay submit, admin writes).
  // Never map those "insufficient funds" responses to the end-user wallet message.
  if (
    isInsufficientNativeGasText(raw) ||
    isAccountPrefundGasText(raw) ||
    isServicerInsufficientNativeText(raw)
  ) {
    return {
      code: 'SERVICER_INSUFFICIENT_NATIVE',
      message: messageForCode('SERVICER_INSUFFICIENT_NATIVE'),
      raw,
    }
  }
  const fromText = classifyFromText(raw, 'general')
  if (fromText) {
    if (error.detailLines.length && fromText.code === 'API_MESSAGE') {
      return {
        code: 'API_VALIDATION',
        message: raw,
        raw,
      }
    }
    return fromText
  }

  if (error.status === 401) {
    return { code: 'API_UNAUTHORIZED', message: messageForCode('API_UNAUTHORIZED'), raw }
  }
  if (error.status === 403) {
    return { code: 'API_FORBIDDEN', message: messageForCode('API_FORBIDDEN'), raw }
  }
  if (error.status === 404) {
    return { code: 'API_NOT_FOUND', message: messageForCode('API_NOT_FOUND'), raw }
  }
  if (error.status === 409) {
    return { code: 'API_CONFLICT', message: messageForCode('API_CONFLICT'), raw }
  }
  if (error.status >= 500) {
    return { code: 'API_SERVER', message: messageForCode('API_SERVER'), raw }
  }
  if (error.detailLines.length) {
    return {
      code: 'API_VALIDATION',
      message: raw || messageForCode('API_VALIDATION'),
      raw,
    }
  }

  const cleaned = stripHexNoise(error.message)
  if (cleaned && !looksTechnical(cleaned)) {
    return { code: 'API_MESSAGE', message: clipped(cleaned, 400), raw }
  }
  if (error.status >= 400 && error.status < 500) {
    return {
      code: 'API_MESSAGE',
      message: cleaned && !looksTechnical(cleaned) ? clipped(cleaned, 400) : messageForCode('API_MESSAGE'),
      raw,
    }
  }
  return { code: 'API_SERVER', message: messageForCode('API_SERVER'), raw }
}

export function classifyAppError(
  error: unknown,
  context: AppErrorContext = 'general',
): ClassifiedAppError {
  if (error instanceof WalletChainSwitchError) {
    if (error.userRejected || isUserRejectedWalletRequest(error.causeError)) {
      return {
        code: 'CHAIN_SWITCH_REJECTED',
        message: error.message || messageForCode('CHAIN_SWITCH_REJECTED'),
        raw: error.message,
      }
    }
    return {
      code: 'CHAIN_SWITCH_FAILED',
      message: error.message || messageForCode('CHAIN_SWITCH_FAILED'),
      raw: error.message,
    }
  }

  if (isUserRejectedWalletRequest(error)) {
    return {
      code: 'WALLET_REJECTED',
      message: messageForCode('WALLET_REJECTED'),
      raw: rawText(error),
    }
  }

  if (error instanceof ApiRequestError) {
    return classifyApiRequestError(error)
  }

  const text = rawText(error)
  const fromText = classifyFromText(text, context)
  if (fromText) return fromText

  // Try each candidate alone in case joining diluted a clean shortMessage / details hit.
  for (const candidate of collectErrorTextCandidates(error)) {
    if (candidate === text) continue
    const hit = classifyFromText(candidate, context)
    if (hit) return { ...hit, raw: text || hit.raw }
  }

  if (text && !looksTechnical(text)) {
    return { code: 'UNKNOWN', message: clipped(text, 400), raw: text }
  }

  if (text) {
    const cleaned = stripHexNoise(text)
      .replace(/EstimateGasExecutionError:?/gi, '')
      .replace(/TransactionExecutionError:?/gi, '')
      .replace(/Docs:.*$/gim, '')
      .replace(/Version:.*$/gim, '')
      .replace(/Request Arguments:[\s\S]*$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (cleaned && !looksTechnical(cleaned) && cleaned.length >= 8) {
      return { code: 'UNKNOWN', message: clipped(cleaned, 400), raw: text }
    }
  }

  return {
    code: 'UNKNOWN',
    message: messageForCode('UNKNOWN'),
    raw: text,
  }
}
