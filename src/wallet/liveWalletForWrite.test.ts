import { describe, expect, it, vi } from 'vitest'

import type { AppWallet } from '@/wallet/appWallet'
import {
  isLiveWalletDisconnectedMessage,
  liveWalletDisconnectedMessage,
  resolveLiveWalletForWrite,
  sameLiveWalletAddress,
  waitForLiveWallet,
} from '@/wallet/liveWalletForWrite'

function wallet(address = '0xAbc'): AppWallet {
  return {
    address,
    walletClientType: 'privy',
    source: 'privy',
    getEthereumProvider: async () => ({ request: async () => null }),
    disconnect: async () => {},
  }
}

describe('sameLiveWalletAddress', () => {
  it('matches checksum-insensitive non-empty addresses', () => {
    expect(sameLiveWalletAddress('0xABC', '0xabc')).toBe(true)
    expect(sameLiveWalletAddress('0xabc', '0xdef')).toBe(false)
    expect(sameLiveWalletAddress('', '0xabc')).toBe(false)
    expect(sameLiveWalletAddress(null, '0xabc')).toBe(false)
  })
})

describe('resolveLiveWalletForWrite', () => {
  it('is ready when a live signer exists even if ready is still false', () => {
    const w = wallet()
    expect(
      resolveLiveWalletForWrite({ ready: false, wallet: w, address: w.address }, 'invest'),
    ).toEqual({ status: 'ready', wallet: w, address: w.address })
  })

  it('is booting when providers are not ready and no signer exists', () => {
    expect(resolveLiveWalletForWrite({ ready: false, wallet: null, address: null })).toEqual({
      status: 'booting',
    })
  })

  it('is disconnected after restore with no signer', () => {
    expect(resolveLiveWalletForWrite({ ready: true, wallet: null, address: null }, 'invest')).toEqual(
      {
        status: 'disconnected',
        message: liveWalletDisconnectedMessage('invest'),
      },
    )
    expect(
      resolveLiveWalletForWrite({ ready: true, wallet: wallet(), address: '  ' }, 'repay'),
    ).toEqual({
      status: 'disconnected',
      message: liveWalletDisconnectedMessage('repay'),
    })
  })
})

describe('isLiveWalletDisconnectedMessage', () => {
  it('matches reconnect and legacy connect copy', () => {
    expect(isLiveWalletDisconnectedMessage(liveWalletDisconnectedMessage('invest'))).toBe(true)
    expect(isLiveWalletDisconnectedMessage('Connect your wallet to invest.')).toBe(true)
    expect(isLiveWalletDisconnectedMessage('Connect your wallet to repay.')).toBe(true)
    expect(isLiveWalletDisconnectedMessage('Something went wrong.')).toBe(false)
  })
})

describe('waitForLiveWallet', () => {
  it('returns immediately when already ready', async () => {
    const w = wallet()
    const sleep = vi.fn(async () => {})
    const result = await waitForLiveWallet(
      () => ({ ready: true, wallet: w, address: w.address }),
      { sleep, timeoutMs: 1_000, intervalMs: 50 },
    )
    expect(result).toEqual({ status: 'ready', wallet: w, address: w.address })
    expect(sleep).not.toHaveBeenCalled()
  })

  it('does not wait out the timeout when restore already finished disconnected', async () => {
    const sleep = vi.fn(async () => {})
    const result = await waitForLiveWallet(
      () => ({ ready: true, wallet: null, address: null }),
      { action: 'invest', sleep, timeoutMs: 1_000, intervalMs: 50 },
    )
    expect(result.status).toBe('disconnected')
    expect(sleep).not.toHaveBeenCalled()
  })

  it('polls while booting then returns the live signer', async () => {
    const w = wallet()
    let calls = 0
    const sleep = vi.fn(async () => {
      calls += 1
    })
    const result = await waitForLiveWallet(
      () =>
        calls === 0
          ? { ready: false, wallet: null, address: null }
          : { ready: true, wallet: w, address: w.address },
      { sleep, timeoutMs: 1_000, intervalMs: 10 },
    )
    expect(result).toEqual({ status: 'ready', wallet: w, address: w.address })
    expect(sleep).toHaveBeenCalled()
  })
})
