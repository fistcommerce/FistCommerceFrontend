import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  __resetBridgeSessionBusyDepthForTests,
  getBridgeSessionBusyDepth,
  withBridgeSessionBusy,
} from '@/bridge/withBridgeSessionBusy'
import { setWalletActionPending } from '@/store/slices/walletSlice'

const dispatch = vi.fn()

vi.mock('@/store/storeRef', () => ({
  getAppStore: () => ({
    getState: () => ({ auth: {}, wallet: {} }),
    dispatch,
  }),
}))

describe('withBridgeSessionBusy', () => {
  afterEach(() => {
    __resetBridgeSessionBusyDepthForTests()
    dispatch.mockClear()
  })

  it('sets and clears actionPending around work', async () => {
    const result = await withBridgeSessionBusy(async () => {
      expect(getBridgeSessionBusyDepth()).toBe(1)
      expect(dispatch).toHaveBeenCalledWith(setWalletActionPending(true))
      return 42
    })
    expect(result).toBe(42)
    expect(getBridgeSessionBusyDepth()).toBe(0)
    expect(dispatch).toHaveBeenCalledWith(setWalletActionPending(false))
  })

  it('nests depth so outer busy stays until all finish', async () => {
    await withBridgeSessionBusy(async () => {
      expect(dispatch).toHaveBeenCalledTimes(1)
      await withBridgeSessionBusy(async () => {
        expect(getBridgeSessionBusyDepth()).toBe(2)
        expect(dispatch).toHaveBeenCalledTimes(1)
      })
      expect(getBridgeSessionBusyDepth()).toBe(1)
      expect(dispatch).toHaveBeenCalledTimes(1)
    })
    expect(getBridgeSessionBusyDepth()).toBe(0)
    expect(dispatch).toHaveBeenCalledWith(setWalletActionPending(false))
  })

  it('clears busy when the work throws', async () => {
    await expect(
      withBridgeSessionBusy(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(getBridgeSessionBusyDepth()).toBe(0)
    expect(dispatch).toHaveBeenCalledWith(setWalletActionPending(false))
  })
})
