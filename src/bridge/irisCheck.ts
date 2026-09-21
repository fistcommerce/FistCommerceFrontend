export type IrisInspectResult = {
  http_status: number
  source_domain: number
  burn_tx_hash: string
  iris_url: string
  applied: boolean
  iris: Record<string, unknown>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function pickStr(r: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = r[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

export function firstIrisMessage(payload: unknown): Record<string, unknown> | null {
  const root = asRecord(payload)
  if (!root) return null
  const messages = root.messages
  if (Array.isArray(messages) && messages.length > 0) {
    return asRecord(messages[0])
  }
  return asRecord(root.message)
}

export function irisCheckSummary(result: Pick<IrisInspectResult, 'http_status' | 'iris'>): string {
  if (result.http_status === 404) {
    return 'Circle has not indexed this burn yet. That is normal for a few minutes after it confirms.'
  }
  const message = firstIrisMessage(result.iris)
  if (!message) {
    return 'Circle returned no message for this burn yet. Wait and check again.'
  }
  const status = pickStr(message, 'status', 'attestationStatus').toLowerCase()
  const dest =
    pickStr(message, 'destinationTransactionHash', 'destinationTxHash', 'forwardTxHash') ||
    pickStr(message, 'forward_tx_hash')
  const forwardState = pickStr(message, 'forwardState', 'forward_state').toUpperCase()
  if (dest || status === 'complete' || status === 'completed' || status === 'confirmed') {
    if (dest) return 'Circle says the USDC has arrived on Arc.'
    return 'Circle has attested this burn. The Arc mint should follow shortly.'
  }
  if (forwardState === 'PENDING') {
    return 'Circle attested the burn and is still forwarding the mint to Arc.'
  }
  if (status === 'pending_confirmations' || status === 'pending' || status === 'attesting') {
    return 'Circle is still confirming the burn. This can take a few minutes on testnet.'
  }
  return `Circle status: ${status || 'unknown'}.`
}
