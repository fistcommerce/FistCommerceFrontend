import { describe, expect, it } from 'vitest'

import { resolveOriginatingChainId } from '@/bridge/restoreWalletChain'

describe('resolveOriginatingChainId', () => {
  it('prefers auth chain over wallet chain', () => {
    expect(
      resolveOriginatingChainId({ authChainId: 5042002, walletChainId: 421614 }),
    ).toBe(5042002)
  })

  it('falls back to wallet chain', () => {
    expect(resolveOriginatingChainId({ authChainId: null, walletChainId: 421614 })).toBe(421614)
  })

  it('returns null when neither is set', () => {
    expect(resolveOriginatingChainId({ authChainId: null, walletChainId: undefined })).toBeNull()
  })
})
