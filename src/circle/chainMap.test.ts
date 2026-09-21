import { describe, expect, it } from 'vitest'

import {
  AVAX_FUJI_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
  ETH_SEPOLIA_CHAIN_ID,
  chainIdFromCircleBlockchain,
  circleBlockchainFromChainId,
  getCircleSwitchChainById,
  isCircleHopChainId,
  isCircleLoginChainId,
  isCircleSupportedChainId,
} from '@/circle/chainMap'
import { ARC_TESTNET_CHAIN_ID, TESTNET_CHAIN_ID } from '@/contract_config/contractNetwork'

describe('circle/chainMap', () => {
  it('maps login and hop Circle blockchain codes', () => {
    expect(circleBlockchainFromChainId(ARC_TESTNET_CHAIN_ID)).toBe('ARC-TESTNET')
    expect(circleBlockchainFromChainId(TESTNET_CHAIN_ID)).toBe('ARB-SEPOLIA')
    expect(circleBlockchainFromChainId(ETH_SEPOLIA_CHAIN_ID)).toBe('ETH-SEPOLIA')
    expect(circleBlockchainFromChainId(BASE_SEPOLIA_CHAIN_ID)).toBe('BASE-SEPOLIA')
    expect(circleBlockchainFromChainId(AVAX_FUJI_CHAIN_ID)).toBe('AVAX-FUJI')
    expect(chainIdFromCircleBlockchain('ETH-SEPOLIA')).toBe(ETH_SEPOLIA_CHAIN_ID)
  })

  it('treats Eth/Base/Fuji as hop-only, not Fist login chains', () => {
    expect(isCircleHopChainId(ETH_SEPOLIA_CHAIN_ID)).toBe(true)
    expect(isCircleLoginChainId(ETH_SEPOLIA_CHAIN_ID)).toBe(false)
    expect(isCircleLoginChainId(ARC_TESTNET_CHAIN_ID)).toBe(true)
    expect(isCircleSupportedChainId(BASE_SEPOLIA_CHAIN_ID)).toBe(true)
  })

  it('resolves viem chains for Circle switches including hop sources', () => {
    expect(getCircleSwitchChainById(ETH_SEPOLIA_CHAIN_ID)?.id).toBe(ETH_SEPOLIA_CHAIN_ID)
    expect(getCircleSwitchChainById(AVAX_FUJI_CHAIN_ID)?.id).toBe(AVAX_FUJI_CHAIN_ID)
    expect(getCircleSwitchChainById(TESTNET_CHAIN_ID)?.id).toBe(TESTNET_CHAIN_ID)
    expect(getCircleSwitchChainById(1)).toBeNull()
  })
})
