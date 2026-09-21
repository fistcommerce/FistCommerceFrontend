export type CctpBridgeStepLike = {
  name?: string
  state?: string
  txHash?: string
}

export type CctpBridgeResultLike = {
  state?: string
  steps?: CctpBridgeStepLike[]
}

export type CctpBridgeTxHashes = {
  burnTxHash?: string
  mintTxHash?: string
}

function isTxHash(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value.trim())
}

function stepName(step: CctpBridgeStepLike): string {
  return String(step.name ?? '').trim().toLowerCase()
}

export function extractBridgeTxHashes(result: CctpBridgeResultLike | null | undefined): CctpBridgeTxHashes {
  const steps = result?.steps ?? []
  let burnTxHash: string | undefined
  let mintTxHash: string | undefined
  for (const step of steps) {
    if (!isTxHash(step.txHash)) continue
    const name = stepName(step)
    if (!burnTxHash && (name.includes('burn') || name.includes('deposit'))) {
      burnTxHash = step.txHash.trim()
    }
    if (!mintTxHash && name.includes('mint')) {
      mintTxHash = step.txHash.trim()
    }
  }
  if (!burnTxHash) {
    const first = steps.find((s) => isTxHash(s.txHash) && s.state === 'success')
    if (first?.txHash) burnTxHash = first.txHash.trim()
  }
  return { burnTxHash, mintTxHash }
}

export function burnTxHashFromKitPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const rec = payload as Record<string, unknown>
  const method = String(rec.method ?? rec.name ?? rec.action ?? '').toLowerCase()
  const values =
    rec.values && typeof rec.values === 'object'
      ? (rec.values as Record<string, unknown>)
      : rec
  const txHash = values.txHash ?? values.transactionHash ?? rec.txHash
  if (!isTxHash(txHash)) return undefined
  if (method.includes('burn') || method.includes('deposit_for_burn')) {
    return txHash.trim()
  }
  return undefined
}
