import { describe, expect, it } from 'vitest'

import { isWalletSessionBusy } from '@/wallet/sessionBusy'

describe('isWalletSessionBusy', () => {
  it('is true for writePending, actionPending, or fundingHop.active', () => {
    expect(isWalletSessionBusy({ writePending: true })).toBe(true)
    expect(isWalletSessionBusy({ actionPending: true })).toBe(true)
    expect(
      isWalletSessionBusy({
        fundingHop: {
          active: true,
          phase: 'bridging',
          sessionChainId: 5042002,
          sessionWallet: '0xabc',
          hopChainId: 421614,
          purpose: 'deposit',
        },
      }),
    ).toBe(true)
  })

  it('stays busy when fundingHop is active even if actionPending was cleared', () => {
    expect(
      isWalletSessionBusy({
        writePending: false,
        actionPending: false,
        fundingHop: {
          active: true,
          phase: 'switching_source',
          sessionChainId: 5042002,
          sessionWallet: '0xabc',
          hopChainId: 11155111,
          purpose: 'deposit',
        },
      }),
    ).toBe(true)
  })

  it('is false when idle', () => {
    expect(isWalletSessionBusy({})).toBe(false)
    expect(isWalletSessionBusy({ fundingHop: null })).toBe(false)
  })
})
