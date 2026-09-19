import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearRepayUsdcSource,
  loadRepayUsdcSource,
  resolveRepayUsdcSource,
  saveRepayUsdcSource,
} from '@/bridge/repayUsdcSourceStorage'

const sample = {
  chainId: 421614,
  label: 'Arbitrum Sepolia',
  bridgeKitId: 'Arbitrum_Sepolia',
  requiresBridge: true,
  usdcAddress: '0xusdc',
  usdcDecimals: 6,
}

describe('repayUsdcSourceStorage', () => {
  const mem = new Map<string, string>()

  beforeEach(() => {
    mem.clear()
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v)
      },
      removeItem: (k: string) => {
        mem.delete(k)
      },
    })
  })

  afterEach(() => {
    clearRepayUsdcSource('loan-1')
    vi.unstubAllGlobals()
  })

  it('saves and loads a source for a loan', () => {
    saveRepayUsdcSource('loan-1', sample)
    expect(loadRepayUsdcSource('loan-1')).toEqual(sample)
  })

  it('prefers location state over storage', () => {
    saveRepayUsdcSource('loan-1', sample)
    const fromState = { ...sample, label: 'From state' }
    expect(resolveRepayUsdcSource('loan-1', fromState)?.label).toBe('From state')
  })

  it('falls back to storage when state is missing', () => {
    saveRepayUsdcSource('loan-1', sample)
    expect(resolveRepayUsdcSource('loan-1', undefined)?.chainId).toBe(421614)
  })

  it('clears storage', () => {
    saveRepayUsdcSource('loan-1', sample)
    clearRepayUsdcSource('loan-1')
    expect(loadRepayUsdcSource('loan-1')).toBeNull()
  })
})
