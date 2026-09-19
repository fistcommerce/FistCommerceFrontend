import { describe, expect, it } from 'vitest'

import {
  eligibleRowsFromBridgeConfig,
  mergeBridgeBalanceRows,
  normalizeEligibleBalance,
  type BridgeConfig,
} from '@/api/bridge'

const config: BridgeConfig = {
  destination: {
    chainId: 5042002,
    cctpDomain: 26,
    bridgeKitId: 'Arc_Testnet',
    usdcAddress: '0xarc',
    usdcDecimals: 6,
  },
  sources: [
    {
      chainId: 421614,
      cctpDomain: 3,
      label: 'Arbitrum Sepolia',
      bridgeKitId: 'Arbitrum_Sepolia',
      usdcAddress: '0xarb',
      usdcDecimals: 6,
    },
    {
      chainId: 84532,
      cctpDomain: 6,
      label: 'Base Sepolia',
      bridgeKitId: 'Base_Sepolia',
      usdcAddress: '0xbase',
      usdcDecimals: 6,
    },
  ],
  eligibleBalances: [
    {
      chainId: 5042002,
      label: 'Arc Testnet',
      bridgeKitId: 'Arc_Testnet',
      usdcAddress: '0xarc',
      usdcDecimals: 6,
      requiresBridge: false,
    },
    {
      chainId: 421614,
      label: 'Arbitrum Sepolia',
      bridgeKitId: 'Arbitrum_Sepolia',
      usdcAddress: '0xarb',
      usdcDecimals: 6,
      requiresBridge: true,
    },
    {
      chainId: 84532,
      label: 'Base Sepolia',
      bridgeKitId: 'Base_Sepolia',
      usdcAddress: '0xbase',
      usdcDecimals: 6,
      requiresBridge: true,
    },
  ],
}

describe('bridge balance normalization / merge', () => {
  it('normalizes snake_case balance rows', () => {
    const row = normalizeEligibleBalance({
      chain_id: 421614,
      label: 'Arbitrum Sepolia',
      bridge_kit_id: 'Arbitrum_Sepolia',
      usdc_address: '0xarb',
      usdc_decimals: 6,
      requires_bridge: true,
      balance: '12.5',
      sufficient: true,
    })
    expect(row).toMatchObject({
      chainId: 421614,
      bridgeKitId: 'Arbitrum_Sepolia',
      requiresBridge: true,
      balance: '12.5',
      sufficient: true,
    })
  })

  it('keeps all config chains when API only returns Arc', () => {
    const merged = mergeBridgeBalanceRows(config, [
      {
        chainId: 5042002,
        label: 'Arc Testnet',
        bridgeKitId: 'Arc_Testnet',
        usdcAddress: '0xarc',
        usdcDecimals: 6,
        requiresBridge: false,
        balance: '3',
        sufficient: true,
      },
    ])
    expect(merged.map((b) => b.chainId)).toEqual([5042002, 421614, 84532])
    expect(merged[0]?.balance).toBe('3')
    expect(merged[1]?.requiresBridge).toBe(true)
  })

  it('builds rows from sources when eligibleBalances is empty', () => {
    const rows = eligibleRowsFromBridgeConfig({ ...config, eligibleBalances: [] })
    expect(rows.map((b) => b.chainId)).toEqual([5042002, 421614, 84532])
    expect(rows[0]?.requiresBridge).toBe(false)
  })
})
