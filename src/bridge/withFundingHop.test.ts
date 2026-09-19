import { beforeEach, describe, expect, it, vi } from 'vitest'

const dispatch = vi.fn()
const getState = vi.fn(() => ({
  auth: {},
  wallet: { writePending: false, actionPending: false, fundingHop: null },
}))

vi.mock('@/store/storeRef', () => ({
  getAppStore: () => ({ getState, dispatch }),
}))

import {
  __resetFundingHopDepthForTests,
  getFundingHopDepth,
  withFundingHop,
} from '@/bridge/withFundingHop'
import { __resetBridgeSessionBusyDepthForTests } from '@/bridge/withBridgeSessionBusy'
import { beginFundingHop, endFundingHop, setWalletActionPending } from '@/store/slices/walletSlice'

describe('withFundingHop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetFundingHopDepthForTests()
    __resetBridgeSessionBusyDepthForTests()
  })

  it('begins and ends funding hop around work', async () => {
    const result = await withFundingHop(
      {
        sessionChainId: 5042002,
        sessionWallet: '0xaaa',
        hopChainId: 421614,
        purpose: 'deposit',
      },
      async () => {
        expect(getFundingHopDepth()).toBe(1)
        return 42
      },
    )
    expect(result).toBe(42)
    expect(getFundingHopDepth()).toBe(0)
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: beginFundingHop.type }),
    )
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: endFundingHop.type }))
    expect(dispatch).toHaveBeenCalledWith(setWalletActionPending(true))
    expect(dispatch).toHaveBeenCalledWith(setWalletActionPending(false))
  })

  it('ends hop on throw', async () => {
    await expect(
      withFundingHop(
        {
          sessionChainId: 5042002,
          sessionWallet: '0xaaa',
          hopChainId: 84532,
          purpose: 'repayment',
        },
        async () => {
          throw new Error('boom')
        },
      ),
    ).rejects.toThrow('boom')
    expect(getFundingHopDepth()).toBe(0)
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: endFundingHop.type }))
  })

  it('nests depth without clearing hop early', async () => {
    await withFundingHop(
      {
        sessionChainId: 5042002,
        sessionWallet: '0xaaa',
        hopChainId: 421614,
        purpose: 'deposit',
      },
      async () => {
        await withFundingHop(
          {
            sessionChainId: 5042002,
            sessionWallet: '0xaaa',
            hopChainId: 421614,
            purpose: 'deposit',
            phase: 'bridging',
          },
          async () => {
            expect(getFundingHopDepth()).toBe(2)
          },
        )
        expect(getFundingHopDepth()).toBe(1)
      },
    )
    expect(getFundingHopDepth()).toBe(0)
  })
})
