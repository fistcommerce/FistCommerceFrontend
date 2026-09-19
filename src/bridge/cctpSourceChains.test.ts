import { describe, expect, it } from 'vitest'

import {
  getCctpHopSourceChainById,
  getWalletSwitchChainById,
  isWalletSwitchChainId,
} from '@/bridge/cctpSourceChains'
import { ARC_TESTNET_CHAIN_ID } from '@/contract_config/contractNetwork'

describe('cctpSourceChains', () => {
  it('resolves live backend CCTP hop sources', () => {
    expect(getCctpHopSourceChainById(11155111)?.name).toMatch(/Sepolia/i) // Ethereum Sepolia
    expect(getCctpHopSourceChainById(84532)?.name).toMatch(/Base/i)
    expect(getCctpHopSourceChainById(43113)?.name).toMatch(/Fuji|Avalanche/i)
  })

  it('includes app chains via wallet switch resolver', () => {
    expect(getWalletSwitchChainById(421614)?.id).toBe(421614) // Arb Sepolia
    expect(getWalletSwitchChainById(ARC_TESTNET_CHAIN_ID)?.id).toBe(ARC_TESTNET_CHAIN_ID)
    expect(isWalletSwitchChainId(11155111)).toBe(true)
    expect(isWalletSwitchChainId(1)).toBe(false)
  })
})
