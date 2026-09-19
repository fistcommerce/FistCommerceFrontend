import { describe, expect, it } from 'vitest'

import type { BridgeConfig, BridgeEligibleBalance } from '@/api/bridge'
import {
  acceptedChainIdSet,
  assertAcceptedBridgeSelection,
  filterBalancesForCircleWallet,
  filterBalancesToAccepted,
  isAcceptedBridgeSelection,
} from '@/bridge/acceptedSources'

const config: BridgeConfig = {
  destination: {
    chainId: 5042002,
    cctpDomain: 0,
    bridgeKitId: 'Arc_Testnet',
    usdcAddress: '0xarcusdc',
    usdcDecimals: 6,
  },
  sources: [
    {
      chainId: 421614,
      cctpDomain: 3,
      label: 'Arbitrum Sepolia',
      bridgeKitId: 'Arbitrum_Sepolia',
      usdcAddress: '0xarbusdc',
      usdcDecimals: 6,
    },
  ],
}

function bal(
  partial: Partial<BridgeEligibleBalance> & Pick<BridgeEligibleBalance, 'chainId' | 'label'>,
): BridgeEligibleBalance {
  return {
    bridgeKitId: null,
    usdcAddress: '0x',
    usdcDecimals: 6,
    requiresBridge: false,
    ...partial,
  }
}

describe('acceptedSources', () => {
  it('builds allowlist from destination + sources', () => {
    expect([...acceptedChainIdSet(config)].sort()).toEqual([421614, 5042002])
  })

  it('filters balances to accepted chains only', () => {
    const rows = [
      bal({ chainId: 5042002, label: 'Arc', requiresBridge: false }),
      bal({
        chainId: 421614,
        label: 'Arb',
        requiresBridge: true,
        bridgeKitId: 'Arbitrum_Sepolia',
      }),
      bal({ chainId: 1, label: 'Mainnet', requiresBridge: true, bridgeKitId: 'Ethereum' }),
    ]
    expect(filterBalancesToAccepted(rows, config).map((b) => b.chainId)).toEqual([
      5042002, 421614,
    ])
  })

  it('keeps Circle-supported CCTP sources for Circle wallets', () => {
    const rows = [
      bal({ chainId: 5042002, label: 'Arc', requiresBridge: false }),
      bal({
        chainId: 421614,
        label: 'Arb',
        requiresBridge: true,
        bridgeKitId: 'Arbitrum_Sepolia',
      }),
      bal({
        chainId: 999001,
        label: 'Unsupported hop',
        requiresBridge: true,
        bridgeKitId: 'Nope',
      }),
    ]
    expect(filterBalancesForCircleWallet(rows, true).map((b) => b.chainId)).toEqual([
      5042002, 421614,
    ])
    expect(filterBalancesForCircleWallet(rows, false)).toHaveLength(3)
  })

  it('accepts Arc destination and matching CCTP source', () => {
    expect(
      isAcceptedBridgeSelection(
        { chainId: 5042002, bridgeKitId: null, requiresBridge: false },
        config,
      ),
    ).toBe(true)
    expect(
      isAcceptedBridgeSelection(
        {
          chainId: 421614,
          bridgeKitId: 'Arbitrum_Sepolia',
          requiresBridge: true,
        },
        config,
      ),
    ).toBe(true)
  })

  it('rejects unknown or mismatched sources', () => {
    expect(
      isAcceptedBridgeSelection(
        { chainId: 1, bridgeKitId: 'Ethereum', requiresBridge: true },
        config,
      ),
    ).toBe(false)
    expect(
      isAcceptedBridgeSelection(
        {
          chainId: 421614,
          bridgeKitId: 'Wrong_Kit',
          requiresBridge: true,
        },
        config,
      ),
    ).toBe(false)
    expect(() =>
      assertAcceptedBridgeSelection(
        { chainId: 1, bridgeKitId: 'x', requiresBridge: true, label: 'Bad' },
        config,
      ),
    ).toThrow(/not an accepted funding source/)
  })
})
