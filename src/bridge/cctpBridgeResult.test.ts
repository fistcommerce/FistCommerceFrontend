import { describe, expect, it } from 'vitest'

import { burnTxHashFromKitPayload, extractBridgeTxHashes } from '@/bridge/cctpBridgeResult'

describe('extractBridgeTxHashes', () => {
  it('reads burn and mint hashes from Bridge Kit steps', () => {
    expect(
      extractBridgeTxHashes({
        steps: [
          { name: 'approve', state: 'success', txHash: `0x${'a'.repeat(64)}` },
          { name: 'burn', state: 'success', txHash: `0x${'b'.repeat(64)}` },
          { name: 'mint', state: 'success', txHash: `0x${'c'.repeat(64)}` },
        ],
      }),
    ).toEqual({
      burnTxHash: `0x${'b'.repeat(64)}`,
      mintTxHash: `0x${'c'.repeat(64)}`,
    })
  })
})

describe('burnTxHashFromKitPayload', () => {
  it('extracts a burn tx hash from a kit event payload', () => {
    expect(
      burnTxHashFromKitPayload({
        method: 'burn',
        values: { txHash: `0x${'d'.repeat(64)}` },
      }),
    ).toBe(`0x${'d'.repeat(64)}`)
  })

  it('ignores approve events', () => {
    expect(
      burnTxHashFromKitPayload({
        method: 'approve',
        values: { txHash: `0x${'d'.repeat(64)}` },
      }),
    ).toBeUndefined()
  })
})
