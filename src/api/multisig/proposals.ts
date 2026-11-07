import { apiUrl, parseApiErrorResponse } from '@/api/client'
import { parseAdminWriteResponse } from '@/api/adminActionResponse'
import { fetchWithAuthRecovery } from '@/api/authorizedFetch'
import {
  normalizeProposalDetail,
  normalizeProposalListRow,
  normalizeSigningPayload,
} from '@/api/multisig/normalize'
import type {
  ExecuteProposalResult,
  ProposalDetail,
  ProposalListRow,
  ProposalStatus,
  SigningPayload,
  OperationType,
} from '@/api/types/multisig'

const PROPOSALS_PATH = '/multisig/proposals/'

function authHeaders(accessToken: string | null | undefined): HeadersInit {
  const t = typeof accessToken === 'string' ? accessToken.trim() : ''
  if (!t) throw new Error('Missing access token for multisig API request.')
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

export type FetchMultisigProposalsParams = {
  status?: ProposalStatus | 'all'
  operationType?: OperationType | 'all'
}

/** `GET /api/multisig/proposals/` */
export async function fetchMultisigProposals(
  accessToken: string | null | undefined,
  params?: FetchMultisigProposalsParams,
): Promise<ProposalListRow[]> {
  const q = new URLSearchParams()
  const status = params?.status?.trim()
  if (status && status !== 'all') q.set('status', status)
  const op = params?.operationType?.trim()
  if (op && op !== 'all') q.set('operation_type', op)

  const suffix = q.toString() ? `?${q.toString()}` : ''
  const res = await fetchWithAuthRecovery(apiUrl(`${PROPOSALS_PATH}${suffix}`), {
    method: 'GET',
    headers: authHeaders(accessToken),
  })
  if (!res.ok) throw await parseApiErrorResponse(res)
  const raw = await res.json()
  const r = asRecord(raw)
  const rows: ProposalListRow[] = []
  const list = Array.isArray(r.results) ? r.results : Array.isArray(raw) ? raw : []
  for (const item of list) {
    const row = normalizeProposalListRow(item)
    if (row) rows.push(row)
  }
  return rows
}

/** `GET /api/multisig/proposals/{id}/` */
export async function fetchMultisigProposalDetail(
  accessToken: string | null | undefined,
  proposalId: string,
): Promise<ProposalDetail> {
  const id = proposalId.trim()
  if (!id) throw new Error('Missing proposal id.')
  const res = await fetchWithAuthRecovery(apiUrl(`${PROPOSALS_PATH}${encodeURIComponent(id)}/`), {
    method: 'GET',
    headers: authHeaders(accessToken),
  })
  if (!res.ok) throw await parseApiErrorResponse(res)
  const raw = await res.json()
  const detail = normalizeProposalDetail(raw)
  if (!detail) throw new Error('Proposal detail response was missing required fields.')
  return detail
}

/** `GET /api/multisig/proposals/{id}/signing-payload/` */
export async function fetchMultisigSigningPayload(
  accessToken: string | null | undefined,
  proposalId: string,
): Promise<SigningPayload> {
  const id = proposalId.trim()
  if (!id) throw new Error('Missing proposal id.')
  const res = await fetchWithAuthRecovery(
    apiUrl(`${PROPOSALS_PATH}${encodeURIComponent(id)}/signing-payload/`),
    {
      method: 'GET',
      headers: authHeaders(accessToken),
    },
  )
  if (!res.ok) throw await parseApiErrorResponse(res)
  const raw = await res.json()
  const payload = normalizeSigningPayload(raw)
  if (!payload) throw new Error('Signing payload response was missing required fields.')
  return payload
}

/** `POST /api/multisig/proposals/{id}/sign/` */
export async function postMultisigProposalSign(
  accessToken: string | null | undefined,
  proposalId: string,
  params: { signerAddress: string; signature: string },
): Promise<void> {
  const id = proposalId.trim()
  if (!id) throw new Error('Missing proposal id.')
  const res = await fetchWithAuthRecovery(apiUrl(`${PROPOSALS_PATH}${encodeURIComponent(id)}/sign/`), {
    method: 'POST',
    headers: jsonAuthHeaders(accessToken),
    body: JSON.stringify({
      signer_address: params.signerAddress.trim(),
      signature: params.signature.trim(),
    }),
  })
  await parseAdminWriteResponse(res)
}

/**
 * `POST /api/multisig/proposals/{id}/execute/` — servicer-relayed execute.
 *
 * @deprecated App UI must use owner `handleOps` via {@link fetchMultisigExecutionPayload}
 * + {@link postMultisigProposalConfirmExecute} (`useGovernanceExecuteProposal`).
 * Kept only for Hardhat/ops scripts that still call the relay endpoint.
 */
export async function postMultisigProposalExecute(
  accessToken: string | null | undefined,
  proposalId: string,
): Promise<ExecuteProposalResult> {
  const id = proposalId.trim()
  if (!id) throw new Error('Missing proposal id.')
  const res = await fetchWithAuthRecovery(apiUrl(`${PROPOSALS_PATH}${encodeURIComponent(id)}/execute/`), {
    method: 'POST',
    headers: jsonAuthHeaders(accessToken),
    body: JSON.stringify({}),
  })
  const outcome = await parseAdminWriteResponse(res)
  const data = outcome.raw
  return {
    message: outcome.message,
    txHash: outcome.kind === 'completed' ? outcome.txHash ?? pickStr(data, 'tx_hash', 'txHash') : '',
    postExecuteSync: outcome.kind === 'completed' ? outcome.postExecuteSync : undefined,
  }
}

export type MultisigExecutionPayload = {
  proposalId: string
  chainId: number
  entryPoint: `0x${string}`
  handleOpsGas: number
  executionNote: string
  /** Present for EVM ERC-4337 execute; absent on Soroban (use backend execute). */
  userOp?: {
    sender: `0x${string}`
    nonce: bigint
    initCode: `0x${string}`
    callData: `0x${string}`
    accountGasLimits: `0x${string}`
    preVerificationGas: bigint
    gasFees: `0x${string}`
    paymasterAndData: `0x${string}`
    signature: `0x${string}`
  }
  vm?: string
  multisigAddress?: string
  networkPassphrase?: string
  onChainProposalId?: number | string | null
  method?: string
}

function asHex(value: unknown, fallback = '0x'): `0x${string}` {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return fallback as `0x${string}`
  return (text.startsWith('0x') ? text : `0x${text}`) as `0x${string}`
}

function asBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(value)
  if (typeof value === 'string' && value.trim()) return BigInt(value.trim())
  return 0n
}

/** `GET /api/multisig/proposals/{id}/execution-payload/` */
export async function fetchMultisigExecutionPayload(
  accessToken: string | null | undefined,
  proposalId: string,
  options?: { ackQueueJump?: boolean },
): Promise<MultisigExecutionPayload> {
  const id = proposalId.trim()
  if (!id) throw new Error('Missing proposal id.')
  const path = `${PROPOSALS_PATH}${encodeURIComponent(id)}/execution-payload/`
  const url = options?.ackQueueJump ? `${path}?ackQueueJump=true` : path
  const res = await fetchWithAuthRecovery(
    apiUrl(url),
    {
      method: 'GET',
      headers: authHeaders(accessToken),
    },
  )
  if (!res.ok) {
    throw await parseApiErrorResponse(res)
  }
  const raw = await res.json()
  const r = asRecord(raw)
  const vm = pickStr(r, 'vm')
  if (vm === 'soroban') {
    const onChainRaw = r.onChainProposalId ?? r.on_chain_proposal_id
    return {
      proposalId: pickStr(r, 'proposalId', 'proposal_id') || id,
      chainId: Number(r.chainId ?? r.chain_id ?? 0) || 0,
      entryPoint: '0x' as `0x${string}`,
      handleOpsGas: 0,
      executionNote: pickStr(r, 'executionNote', 'execution_note'),
      vm: 'soroban',
      multisigAddress: pickStr(r, 'multisigAddress', 'multisig_address') || undefined,
      networkPassphrase: pickStr(r, 'networkPassphrase', 'network_passphrase') || undefined,
      onChainProposalId:
        onChainRaw == null || onChainRaw === ''
          ? null
          : (typeof onChainRaw === 'number' || typeof onChainRaw === 'string'
              ? onChainRaw
              : String(onChainRaw)),
      method: pickStr(r, 'method') || 'execute',
    }
  }
  const entryPoint = asHex(pickStr(r, 'entryPoint', 'entry_point'))
  const userOpRaw = asRecord(r.userOp ?? r.user_op)
  if (!entryPoint || entryPoint === '0x' || !userOpRaw.sender) {
    const backendMessage =
      pickStr(r, 'message', 'error', 'errorMessage', 'error_message') ||
      pickStr(r, 'detail')
    if (backendMessage) {
      throw new Error(backendMessage)
    }
    throw new Error('Execution payload response was missing required fields.')
  }
  return {
    proposalId: pickStr(r, 'proposalId', 'proposal_id') || id,
    chainId: Number(r.chainId ?? r.chain_id ?? 0) || 0,
    entryPoint,
    handleOpsGas: Number(r.handleOpsGas ?? r.handle_ops_gas ?? 3_000_000) || 3_000_000,
    executionNote: pickStr(r, 'executionNote', 'execution_note'),
    userOp: {
      sender: asHex(userOpRaw.sender),
      nonce: asBigInt(userOpRaw.nonce),
      initCode: asHex(userOpRaw.initCode ?? userOpRaw.init_code),
      callData: asHex(userOpRaw.callData ?? userOpRaw.call_data),
      accountGasLimits: asHex(userOpRaw.accountGasLimits ?? userOpRaw.account_gas_limits),
      preVerificationGas: asBigInt(userOpRaw.preVerificationGas ?? userOpRaw.pre_verification_gas),
      gasFees: asHex(userOpRaw.gasFees ?? userOpRaw.gas_fees),
      paymasterAndData: asHex(userOpRaw.paymasterAndData ?? userOpRaw.paymaster_and_data),
      signature: asHex(userOpRaw.signature),
    },
  }
}

/** `POST /api/multisig/proposals/{id}/confirm-execute/` */
export async function postMultisigProposalConfirmExecute(
  accessToken: string | null | undefined,
  proposalId: string,
  txHash: string,
): Promise<ExecuteProposalResult> {
  const id = proposalId.trim()
  if (!id) throw new Error('Missing proposal id.')
  const hash = txHash.trim()
  if (!hash) throw new Error('Missing execution tx hash.')
  const res = await fetchWithAuthRecovery(
    apiUrl(`${PROPOSALS_PATH}${encodeURIComponent(id)}/confirm-execute/`),
    {
      method: 'POST',
      headers: jsonAuthHeaders(accessToken),
      body: JSON.stringify({ txHash: hash, tx_hash: hash }),
    },
  )
  const outcome = await parseAdminWriteResponse(res)
  const data = outcome.raw
  return {
    message: outcome.message,
    txHash:
      outcome.kind === 'completed'
        ? (outcome.txHash ?? pickStr(data, 'tx_hash', 'txHash')) || hash
        : hash,
    postExecuteSync: outcome.kind === 'completed' ? outcome.postExecuteSync : undefined,
  }
}

/** `POST /api/multisig/proposals/{id}/restart-signatures/` */
export async function postMultisigProposalRestartSignatures(
  accessToken: string | null | undefined,
  proposalId: string,
): Promise<ProposalDetail> {
  const id = proposalId.trim()
  if (!id) throw new Error('Missing proposal id.')
  const res = await fetchWithAuthRecovery(
    apiUrl(`${PROPOSALS_PATH}${encodeURIComponent(id)}/restart-signatures/`),
    {
      method: 'POST',
      headers: jsonAuthHeaders(accessToken),
      body: JSON.stringify({}),
    },
  )
  if (!res.ok) throw await parseApiErrorResponse(res)
  const raw = await res.json()
  const detail = normalizeProposalDetail(raw)
  if (!detail) throw new Error('Restart signatures response was missing required fields.')
  return detail
}

/** `POST /api/multisig/proposals/{id}/cancel/` */
export async function postMultisigProposalCancel(
  accessToken: string | null | undefined,
  proposalId: string,
): Promise<void> {
  const id = proposalId.trim()
  if (!id) throw new Error('Missing proposal id.')
  const res = await fetchWithAuthRecovery(apiUrl(`${PROPOSALS_PATH}${encodeURIComponent(id)}/cancel/`), {
    method: 'POST',
    headers: jsonAuthHeaders(accessToken),
    body: JSON.stringify({}),
  })
  await parseAdminWriteResponse(res)
}

/** `POST /api/multisig/proposals/withdrawal-approve/` — investor resolved on-chain from request_id */
export async function postMultisigCreateWithdrawalApproveProposal(
  accessToken: string | null | undefined,
  body: { requestId: string },
) {
  const res = await fetchWithAuthRecovery(apiUrl(`${PROPOSALS_PATH}withdrawal-approve/`), {
    method: 'POST',
    headers: jsonAuthHeaders(accessToken),
    body: JSON.stringify({
      request_id: body.requestId.trim(),
    }),
  })
  return parseAdminWriteResponse(res)
}

export type MultisigKycStatusCreateBody = {
  wallet: string
  status: 'verified' | 'rejected'
  userRole: 'investor' | 'merchant'
}

/** `POST /api/multisig/proposals/kyc-status/` */
export async function postMultisigCreateKycStatusProposal(
  accessToken: string | null | undefined,
  body: MultisigKycStatusCreateBody,
) {
  const res = await fetchWithAuthRecovery(apiUrl(`${PROPOSALS_PATH}kyc-status/`), {
    method: 'POST',
    headers: jsonAuthHeaders(accessToken),
    body: JSON.stringify({
      wallet: body.wallet.trim(),
      status: body.status,
      user_role: body.userRole,
    }),
  })
  return parseAdminWriteResponse(res)
}

/** `POST /api/multisig/proposals/risk-tier/` */
export async function postMultisigCreateRiskTierProposal(
  accessToken: string | null | undefined,
  body: Record<string, unknown>,
  options?: { signal?: AbortSignal },
) {
  const res = await fetchWithAuthRecovery(apiUrl(`${PROPOSALS_PATH}risk-tier/`), {
    method: 'POST',
    headers: jsonAuthHeaders(accessToken),
    body: JSON.stringify(body),
    signal: options?.signal,
  })
  return parseAdminWriteResponse(res)
}

/** `POST /api/multisig/proposals/multisig-add-signers/` */
export async function postMultisigCreateAddSignersProposal(
  accessToken: string | null | undefined,
  body: { addresses: string[] },
) {
  const res = await fetchWithAuthRecovery(apiUrl(`${PROPOSALS_PATH}multisig-add-signers/`), {
    method: 'POST',
    headers: jsonAuthHeaders(accessToken),
    body: JSON.stringify({ addresses: body.addresses.map((a) => a.trim()) }),
  })
  return parseAdminWriteResponse(res)
}

/** `POST /api/multisig/proposals/multisig-remove-signers/` */
export async function postMultisigCreateRemoveSignersProposal(
  accessToken: string | null | undefined,
  body: { addresses: string[] },
) {
  const res = await fetchWithAuthRecovery(apiUrl(`${PROPOSALS_PATH}multisig-remove-signers/`), {
    method: 'POST',
    headers: jsonAuthHeaders(accessToken),
    body: JSON.stringify({ addresses: body.addresses.map((a) => a.trim()) }),
  })
  return parseAdminWriteResponse(res)
}

/** `POST /api/multisig/proposals/multisig-set-threshold/` */
export async function postMultisigCreateSetThresholdProposal(
  accessToken: string | null | undefined,
  body: { threshold: number },
) {
  const res = await fetchWithAuthRecovery(apiUrl(`${PROPOSALS_PATH}multisig-set-threshold/`), {
    method: 'POST',
    headers: jsonAuthHeaders(accessToken),
    body: JSON.stringify({ threshold: body.threshold }),
  })
  return parseAdminWriteResponse(res)
}

export type MultisigSignerRotationBody = {
  add_addresses?: string[]
  remove_addresses?: string[]
  threshold?: number
}

/** `POST /api/multisig/proposals/multisig-signer-rotation/` */
export async function postMultisigCreateSignerRotationProposal(
  accessToken: string | null | undefined,
  body: MultisigSignerRotationBody,
) {
  const payload: Record<string, unknown> = {}
  if (body.add_addresses?.length) {
    payload.add_addresses = body.add_addresses.map((a) => a.trim())
  }
  if (body.remove_addresses?.length) {
    payload.remove_addresses = body.remove_addresses.map((a) => a.trim())
  }
  if (body.threshold != null) {
    payload.threshold = body.threshold
  }
  const res = await fetchWithAuthRecovery(apiUrl(`${PROPOSALS_PATH}multisig-signer-rotation/`), {
    method: 'POST',
    headers: jsonAuthHeaders(accessToken),
    body: JSON.stringify(payload),
  })
  return parseAdminWriteResponse(res)
}
