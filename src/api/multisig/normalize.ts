import {
  MULTISIG_OPERATION_TYPES,
  type BackendKeyAlignment,
  type MultisigConfig,
  type MultisigPrecondition,
  type MultisigProposalCall,
  type MultisigProposalSignature,
  type MultisigSignerMgmtSync,
  type NonceStatus,
  type OperationType,
  type ProposalDetail,
  type ProposalListRow,
  type ProposalNonceInfo,
  type ProposalStatus,
  type SigningPayload,
  type NonceWarning,
} from '@/api/types/multisig'

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

function pickNullableStr(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = record[key]
    if (v === null) return null
    if (typeof v === 'string') return v.trim() || null
  }
  return null
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

function pickBool(record: Record<string, unknown>, ...keys: string[]): boolean {
  for (const key of keys) {
    const v = record[key]
    if (typeof v === 'boolean') return v
  }
  return false
}

function pickNullableNumber(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const v = record[key]
    if (v === null || v === undefined) continue
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v)
      if (Number.isFinite(n)) return n
    }
  }
  return null
}

function normalizeNonceStatus(raw: string): NonceStatus {
  const t = raw.trim().toLowerCase()
  if (t === 'current') return 'current'
  if (t === 'queued') return 'queued'
  if (t === 'stale') return 'stale'
  return 'unfrozen'
}

function normalizeProposalNonceInfo(raw: unknown): ProposalNonceInfo | undefined {
  const r = asRecord(raw)
  if (!Object.keys(r).length) return undefined
  const blocking: string[] = []
  const blockingRaw = r.blockingProposalIds ?? r.blocking_proposal_ids
  if (Array.isArray(blockingRaw)) {
    for (const id of blockingRaw) {
      if (typeof id === 'string' && id.trim()) blocking.push(id.trim())
    }
  }
  return {
    reservedNonce: pickNullableNumber(r, 'reservedNonce', 'reserved_nonce'),
    frozenNonce: pickNullableNumber(r, 'frozenNonce', 'frozen_nonce'),
    liveNonce: pickNumber(r, 'liveNonce', 'live_nonce'),
    nonceStatus: normalizeNonceStatus(pickStr(r, 'nonceStatus', 'nonce_status') || 'unfrozen'),
    queueSeq: pickNullableNumber(r, 'queueSeq', 'queue_seq'),
    canExecute: pickBool(r, 'canExecute', 'can_execute'),
    requiresQueueJumpAck: pickBool(r, 'requiresQueueJumpAck', 'requires_queue_jump_ack'),
    canRestartSignatures: pickBool(r, 'canRestartSignatures', 'can_restart_signatures'),
    blockingProposalIds: blocking,
    restartCount: pickNumber(r, 'restartCount', 'restart_count'),
  }
}

function normalizeNonceWarning(raw: unknown): NonceWarning | undefined {
  const r = asRecord(raw)
  if (!Object.keys(r).length) return undefined
  const blocking: string[] = []
  const blockingRaw = r.blockingProposalIds ?? r.blocking_proposal_ids
  if (Array.isArray(blockingRaw)) {
    for (const id of blockingRaw) {
      if (typeof id === 'string' && id.trim()) blocking.push(id.trim())
    }
  }
  const message = pickStr(r, 'message')
  if (!message) return undefined
  return {
    code: pickStr(r, 'code') || 'SIGN_AHEAD_OF_QUEUE',
    message,
    blockingProposalIds: blocking,
    willInvalidateOthers: pickBool(r, 'willInvalidateOthers', 'will_invalidate_others'),
    liveNonce: pickNullableNumber(r, 'liveNonce', 'live_nonce'),
    reservedNonce: pickNullableNumber(r, 'reservedNonce', 'reserved_nonce'),
    requiresResign: pickBool(r, 'requiresResign', 'requires_resign'),
  }
}

const OPERATION_TYPE_LOOKUP = new Set<string>(MULTISIG_OPERATION_TYPES)

/**
 * Maps a backend operation type (underscore or hyphen form) to a known {@link OperationType}.
 * Unrecognized values fall back to `'unknown'` — never to a real op — so a newly added backend
 * type is shown neutrally rather than being silently mislabeled as another action.
 */
export function normalizeOperationType(raw: string): OperationType {
  const t = raw.trim().toLowerCase().replace(/-/g, '_')
  return OPERATION_TYPE_LOOKUP.has(t) ? (t as OperationType) : 'unknown'
}

function normalizeProposalStatus(raw: string): ProposalStatus {
  const t = raw.trim().toLowerCase()
  if (t === 'ready') return 'ready'
  if (t === 'executed') return 'executed'
  if (t === 'failed') return 'failed'
  if (t === 'cancelled' || t === 'canceled') return 'cancelled'
  return 'pending_signatures'
}

function normalizeCall(raw: unknown): MultisigProposalCall | null {
  const r = asRecord(raw)
  const target = pickStr(r, 'target')
  const calldata = pickStr(r, 'calldata')
  if (!target && !calldata) return null
  const decodedRaw = r.decodedArgs ?? r.decoded_args
  const decodedArgs =
    decodedRaw && typeof decodedRaw === 'object' && !Array.isArray(decodedRaw)
      ? (decodedRaw as Record<string, unknown>)
      : undefined
  const contract = pickStr(r, 'contract') || undefined
  const fn = pickStr(r, 'function') || undefined
  return { target, calldata, decodedArgs, contract, function: fn }
}

function normalizeSignature(raw: unknown): MultisigProposalSignature | null {
  const r = asRecord(raw)
  const signerAddress = pickStr(r, 'signerAddress', 'signer_address')
  const signedAt = pickStr(r, 'signedAt', 'signed_at')
  if (!signerAddress) return null
  return { signerAddress, signedAt }
}

function normalizePrecondition(raw: unknown): MultisigPrecondition | null {
  const r = asRecord(raw)
  if (!Object.keys(r).length) return null
  return {
    ok: pickBool(r, 'ok'),
    label: pickStr(r, 'label') || undefined,
    error: pickStr(r, 'error') || undefined,
  }
}

export function normalizeMultisigConfig(raw: unknown): MultisigConfig {
  const r = asRecord(raw)
  const signers: string[] = []
  const signersRaw = r.signers
  if (Array.isArray(signersRaw)) {
    for (const s of signersRaw) {
      if (typeof s === 'string' && s.trim()) signers.push(s.trim())
    }
  }
  const capsRaw = asRecord(r.capabilities)
  const contractsRaw = asRecord(r.contracts)
  const contracts: Record<string, string> = {}
  for (const [k, v] of Object.entries(contractsRaw)) {
    if (typeof v === 'string' && v.trim()) contracts[k] = v.trim()
  }
  const methodsRaw = r.onChainMethods ?? r.on_chain_methods
  const onChainMethods = Array.isArray(methodsRaw)
    ? methodsRaw.filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
    : undefined

  return {
    chainId: pickNumber(r, 'chainId', 'chain_id'),
    multisigAddress: pickStr(r, 'multisigAddress', 'multisig_address'),
    threshold: pickNumber(r, 'threshold'),
    signerCount: pickNumber(r, 'signerCount', 'signer_count') || signers.length,
    signers,
    handoffCompleted: pickBool(r, 'handoffCompleted', 'handoff_completed') || undefined,
    servicerAddress: pickStr(r, 'servicerAddress', 'servicer_address') || undefined,
    liveUserOpNonce: pickNullableNumber(r, 'liveUserOpNonce', 'live_user_op_nonce') ?? undefined,
    openProposalCount: pickNullableNumber(r, 'openProposalCount', 'open_proposal_count') ?? undefined,
    executionMode: pickStr(r, 'executionMode', 'execution_mode') || undefined,
    network: pickStr(r, 'network') || undefined,
    networkPassphrase: pickStr(r, 'networkPassphrase', 'network_passphrase') || undefined,
    vm: pickStr(r, 'vm') || undefined,
    message: pickStr(r, 'message') || undefined,
    thresholdSource: pickStr(r, 'thresholdSource', 'threshold_source') || undefined,
    capabilities:
      Object.keys(capsRaw).length > 0
        ? {
            submitProposal: pickBool(capsRaw, 'submitProposal', 'submit_proposal') || undefined,
            confirm: pickBool(capsRaw, 'confirm') || undefined,
            executeMarkOnly: pickBool(capsRaw, 'executeMarkOnly', 'execute_mark_only') || undefined,
            executeCrossContract:
              pickBool(capsRaw, 'executeCrossContract', 'execute_cross_contract') || undefined,
            getProposal: pickBool(capsRaw, 'getProposal', 'get_proposal') || undefined,
            readThreshold: pickBool(capsRaw, 'readThreshold', 'read_threshold') || undefined,
            readIsOwner: pickBool(capsRaw, 'readIsOwner', 'read_is_owner') || undefined,
            addRemoveSigners: pickBool(capsRaw, 'addRemoveSigners', 'add_remove_signers') || undefined,
            setThreshold: pickBool(capsRaw, 'setThreshold', 'set_threshold') || undefined,
            userOpNonce: pickBool(capsRaw, 'userOpNonce', 'user_op_nonce') || undefined,
            erc4337: pickBool(capsRaw, 'erc4337') || undefined,
            roleHandoffToMultisig:
              pickBool(capsRaw, 'roleHandoffToMultisig', 'role_handoff_to_multisig') || undefined,
            adminOpsDirect: pickBool(capsRaw, 'adminOpsDirect', 'admin_ops_direct') || undefined,
          }
        : undefined,
    onChainMethods,
    contracts: Object.keys(contracts).length > 0 ? contracts : undefined,
  }
}

function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((s) => s.trim())
}

function normalizeBackendKeyAlignment(raw: unknown): BackendKeyAlignment {
  const r = asRecord(raw)
  return {
    alignedBackendKeys: normalizeStringArray(r.alignedBackendKeys ?? r.aligned_backend_keys),
    misalignedBackendKeys: normalizeStringArray(r.misalignedBackendKeys ?? r.misaligned_backend_keys),
    allAligned: pickBool(r, 'allAligned', 'all_aligned'),
  }
}

export function normalizeMultisigSignerMgmtSync(raw: unknown): MultisigSignerMgmtSync | null {
  const r = asRecord(raw)
  const mgmt = asRecord(r.multisigSignerMgmt ?? r.multisig_signer_mgmt)
  if (!Object.keys(mgmt).length) return null
  const configRaw = mgmt.multisigConfig ?? mgmt.multisig_config
  if (!configRaw) return null
  return {
    multisigConfig: normalizeMultisigConfig(configRaw),
    backendKeyAlignment: normalizeBackendKeyAlignment(
      mgmt.backendKeyAlignment ?? mgmt.backend_key_alignment,
    ),
  }
}

export function normalizeProposalListRow(raw: unknown): ProposalListRow | null {
  const r = asRecord(raw)
  const id = pickStr(r, 'id')
  if (!id) return null

  const missingSigners: string[] = []
  const missingRaw = r.missingSigners ?? r.missing_signers
  if (Array.isArray(missingRaw)) {
    for (const s of missingRaw) {
      if (typeof s === 'string' && s.trim()) missingSigners.push(s.trim())
    }
  }

  return {
    id,
    operationType: normalizeOperationType(pickStr(r, 'operationType', 'operation_type')),
    status: normalizeProposalStatus(pickStr(r, 'status')),
    summary: pickStr(r, 'summary') || 'Governance proposal',
    relatedType: pickNullableStr(r, 'relatedType', 'related_type'),
    relatedId: pickNullableStr(r, 'relatedId', 'related_id'),
    executionTxHash: pickNullableStr(r, 'executionTxHash', 'execution_tx_hash'),
    createdAt: pickStr(r, 'createdAt', 'created_at'),
    missingSigners,
    validSignatureCount: pickNumber(r, 'validSignatureCount', 'valid_signature_count'),
    threshold: pickNumber(r, 'threshold'),
    nonce: normalizeProposalNonceInfo(r.nonce),
  }
}

export function normalizeProposalDetail(raw: unknown): ProposalDetail | null {
  const r = asRecord(raw)
  const id = pickStr(r, 'id')
  if (!id) return null

  const calls: MultisigProposalCall[] = []
  const callsRaw = r.calls
  if (Array.isArray(callsRaw)) {
    for (const item of callsRaw) {
      const call = normalizeCall(item)
      if (call) calls.push(call)
    }
  }

  const signatures: MultisigProposalSignature[] = []
  const sigsRaw = r.signatures
  if (Array.isArray(sigsRaw)) {
    for (const item of sigsRaw) {
      const sig = normalizeSignature(item)
      if (sig) signatures.push(sig)
    }
  }

  const preconditions: MultisigPrecondition[] = []
  const preRaw = r.preconditions
  if (Array.isArray(preRaw)) {
    for (const item of preRaw) {
      const row = normalizePrecondition(item)
      if (row) preconditions.push(row)
    }
  }

  const missingSigners: string[] = []
  const missingRaw = r.missingSigners ?? r.missing_signers
  if (Array.isArray(missingRaw)) {
    for (const s of missingRaw) {
      if (typeof s === 'string' && s.trim()) missingSigners.push(s.trim())
    }
  }

  return {
    id,
    operationType: normalizeOperationType(pickStr(r, 'operationType', 'operation_type')),
    status: normalizeProposalStatus(pickStr(r, 'status')),
    summary: pickStr(r, 'summary') || 'Governance proposal',
    calls,
    signatures,
    validSignatureCount: pickNumber(r, 'validSignatureCount', 'valid_signature_count'),
    missingSigners,
    readyToExecute: pickBool(r, 'readyToExecute', 'ready_to_execute'),
    simulationError: pickNullableStr(r, 'simulationError', 'simulation_error'),
    preconditions,
    executionTxHash: pickNullableStr(r, 'executionTxHash', 'execution_tx_hash'),
    submittedTxHash: pickNullableStr(r, 'submittedTxHash', 'submitted_tx_hash'),
    userOpHash: pickNullableStr(r, 'userOpHash', 'user_op_hash'),
    relatedType: pickNullableStr(r, 'relatedType', 'related_type'),
    relatedId: pickNullableStr(r, 'relatedId', 'related_id'),
    threshold: pickNumber(r, 'threshold'),
    multisigAddress: pickStr(r, 'multisigAddress', 'multisig_address'),
    createdAt: pickStr(r, 'createdAt', 'created_at'),
    nonce: normalizeProposalNonceInfo(r.nonce),
  }
}

export function normalizeSigningPayload(raw: unknown): SigningPayload | null {
  const r = asRecord(raw)
  const proposalId = pickStr(r, 'proposalId', 'proposal_id')
  const digestRaw =
    pickStr(r, 'userOpHashToSign', 'user_op_hash_to_sign') ||
    pickStr(r, 'digestToSign', 'digest_to_sign')
  if (!proposalId || !digestRaw) return null

  const signers: string[] = []
  if (Array.isArray(r.signers)) {
    for (const s of r.signers) {
      if (typeof s === 'string' && s.trim()) signers.push(s.trim())
    }
  }

  const calls: MultisigProposalCall[] = []
  const callsRaw = r.calls
  if (Array.isArray(callsRaw)) {
    for (const item of callsRaw) {
      const call = normalizeCall(item)
      if (call) calls.push(call)
    }
  }

  const chainId = pickNumber(r, 'chainId', 'chain_id')
  const multisigAddress = pickStr(r, 'multisigAddress', 'multisig_address')
  const vm = pickStr(r, 'vm')
  const isSoroban = vm === 'soroban' || pickStr(r, 'networkPassphrase', 'network_passphrase').length > 0

  if (isSoroban) {
    const onChainRaw = r.onChainProposalId ?? r.on_chain_proposal_id
    return {
      proposalId,
      digestToSign: digestRaw,
      typedData: null,
      chainId,
      nonce: pickNumber(r, 'nonce'),
      multisigAddress,
      threshold: pickNumber(r, 'threshold'),
      signers,
      signingNote: pickStr(r, 'signingNote', 'signing_note'),
      calls,
      nonceWarning: normalizeNonceWarning(r.nonceWarning ?? r.nonce_warning),
      vm: 'soroban',
      networkPassphrase: pickStr(r, 'networkPassphrase', 'network_passphrase') || undefined,
      onChainProposalId:
        onChainRaw == null || onChainRaw === ''
          ? null
          : (typeof onChainRaw === 'number' || typeof onChainRaw === 'string'
              ? onChainRaw
              : String(onChainRaw)),
      actionHash: pickStr(r, 'actionHash', 'action_hash') || undefined,
    }
  }

  const digestToSign = (digestRaw.startsWith('0x') ? digestRaw : `0x${digestRaw}`) as `0x${string}`
  const userOpRaw = pickStr(r, 'userOpHashToSign', 'user_op_hash_to_sign')
  const userOpHashToSign = userOpRaw
    ? ((userOpRaw.startsWith('0x') ? userOpRaw : `0x${userOpRaw}`) as `0x${string}`)
    : digestToSign

  const typedDataRaw = r.typedData ?? r.typed_data
  if (typedDataRaw == null) {
    throw new Error('Signing payload is missing required EIP-712 typedData from the backend.')
  }
  const typedData = normalizeTypedData(typedDataRaw)
  if (!typedData) {
    throw new Error(
      'Signing payload typedData is incomplete (need domain, types.UserOpApproval, primaryType, message.userOpHash).',
    )
  }
  assertSigningTypedDataIntegrity(typedData, {
    chainId,
    multisigAddress,
    userOpHashToSign,
  })

  return {
    proposalId,
    digestToSign,
    userOpHashToSign,
    typedData,
    chainId,
    nonce: pickNumber(r, 'nonce'),
    multisigAddress,
    threshold: pickNumber(r, 'threshold'),
    signers,
    signingNote: pickStr(r, 'signingNote', 'signing_note'),
    calls,
    nonceWarning: normalizeNonceWarning(r.nonceWarning ?? r.nonce_warning),
  }
}

/** Parse backend EIP-712 payload only — no client-side synthesis. */
function normalizeTypedData(raw: unknown): SigningPayload['typedData'] | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (!r.domain || typeof r.domain !== 'object' || Array.isArray(r.domain)) return null
  if (!r.message || typeof r.message !== 'object' || Array.isArray(r.message)) return null
  if (!r.types || typeof r.types !== 'object' || Array.isArray(r.types)) return null

  const domainRec = asRecord(r.domain)
  const messageRec = asRecord(r.message)
  const typesRec = asRecord(r.types)
  if (!Array.isArray(typesRec.UserOpApproval) || typesRec.UserOpApproval.length === 0) return null

  const approvalFields = typesRec.UserOpApproval.map((f) => asRecord(f))
    .filter((f): f is Record<string, unknown> => Object.keys(f).length > 0)
    .map((f) => ({
      name: String(f.name ?? ''),
      type: String(f.type ?? ''),
    }))
    .filter((f) => f.name && f.type)
  if (!approvalFields.length) return null

  const name = pickStr(domainRec, 'name')
  const version = pickStr(domainRec, 'version')
  const chainId = pickNumber(domainRec, 'chainId', 'chain_id')
  const verifyingRaw = pickStr(domainRec, 'verifyingContract', 'verifying_contract')
  if (!name || !version || !chainId || !verifyingRaw || !/^0x[a-fA-F0-9]{40}$/.test(verifyingRaw)) {
    return null
  }
  const verifyingContract = verifyingRaw as `0x${string}`

  const hashRaw = pickStr(messageRec, 'userOpHash', 'user_op_hash')
  if (!hashRaw) return null
  const userOpHash = (hashRaw.startsWith('0x') ? hashRaw : `0x${hashRaw}`) as `0x${string}`

  const primaryRaw = pickStr(r, 'primaryType', 'primary_type')
  if (primaryRaw && primaryRaw !== 'UserOpApproval') return null

  return {
    domain: { name, version, chainId, verifyingContract },
    types: { UserOpApproval: approvalFields },
    primaryType: 'UserOpApproval',
    message: { userOpHash },
  }
}

export function assertSigningTypedDataIntegrity(
  typedData: NonNullable<SigningPayload['typedData']>,
  ctx: {
    chainId: number
    multisigAddress: string
    userOpHashToSign: `0x${string}`
  },
): void {
  if (typedData.primaryType !== 'UserOpApproval') {
    throw new Error(`Signing typedData primaryType must be UserOpApproval (got ${typedData.primaryType}).`)
  }
  if (typedData.domain.name !== 'FistMultisigAccount') {
    throw new Error(
      `Signing typedData domain.name must be FistMultisigAccount (got ${typedData.domain.name}).`,
    )
  }
  if (typedData.domain.version !== '1') {
    throw new Error(`Signing typedData domain.version must be 1 (got ${typedData.domain.version}).`)
  }
  if (ctx.chainId > 0 && typedData.domain.chainId !== ctx.chainId) {
    throw new Error(
      `Signing typedData domain.chainId (${typedData.domain.chainId}) does not match payload chainId (${ctx.chainId}).`,
    )
  }
  const verifying = typedData.domain.verifyingContract.toLowerCase()
  const multisig = ctx.multisigAddress.trim().toLowerCase()
  if (multisig && verifying !== multisig) {
    throw new Error(
      `Signing typedData verifyingContract (${typedData.domain.verifyingContract}) does not match multisigAddress (${ctx.multisigAddress}).`,
    )
  }
  const messageHash = typedData.message.userOpHash.toLowerCase()
  const expectedHash = ctx.userOpHashToSign.toLowerCase()
  if (messageHash !== expectedHash) {
    throw new Error(
      `Signing typedData message.userOpHash does not match userOpHashToSign (${ctx.userOpHashToSign}).`,
    )
  }
}

export function operationTypeLabel(type: OperationType): string {
  switch (type) {
    case 'withdrawal_approve':
      return 'Withdrawal approval'
    case 'withdrawal_reject':
      return 'Withdrawal rejection'
    case 'loan_fund':
      return 'Fund loan'
    case 'loan_reject_funded':
      return 'Cancel funding'
    case 'payout_receivable':
      return 'Funding payout'
    case 'kyc_status':
      return 'KYC status'
    case 'risk_tier':
      return 'Risk tier'
    case 'multisig_add_signers':
      return 'Add multisig owner'
    case 'multisig_remove_signers':
      return 'Remove multisig owner'
    case 'multisig_set_threshold':
      return 'Change multisig threshold'
    case 'multisig_signer_rotation':
      return 'Rotate multisig owners'
    case 'unknown':
      return 'Governance proposal'
    default:
      return 'Governance proposal'
  }
}

export function proposalStatusLabel(status: ProposalStatus): string {
  switch (status) {
    case 'ready':
      return 'Ready to execute'
    case 'executed':
      return 'Executed'
    case 'failed':
      return 'Failed'
    case 'cancelled':
      return 'Cancelled'
    default:
      return 'Pending signatures'
  }
}
