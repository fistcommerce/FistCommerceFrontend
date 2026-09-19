import {
  ARC_TESTNET_CHAIN_ID,
  MAINNET_CHAIN_ID,
  TESTNET_CHAIN_ID,
} from '@/contract_config/contractNetwork'
import { isSupportedAppChainId } from '@/wallet/appChain'
import { getWalletSwitchChainById } from '@/bridge/cctpSourceChains'
import type { Chain } from 'viem'

/**
 * Circle Programmable Wallets blockchain codes used by this app.
 * Login: ARB / ARB-SEPOLIA / ARC-TESTNET.
 * CCTP hop (deposit-scoped): ETH-SEPOLIA / BASE-SEPOLIA / AVAX-FUJI (+ ARB-SEPOLIA).
 */
export type CircleBlockchain =
  | 'ARB'
  | 'ARB-SEPOLIA'
  | 'ARC-TESTNET'
  | 'ETH-SEPOLIA'
  | 'BASE-SEPOLIA'
  | 'AVAX-FUJI'

/** Ethereum Sepolia */
export const ETH_SEPOLIA_CHAIN_ID = 11155111
/** Base Sepolia */
export const BASE_SEPOLIA_CHAIN_ID = 84532
/** Avalanche Fuji */
export const AVAX_FUJI_CHAIN_ID = 43113

const LOGIN_BLOCKCHAIN_BY_CHAIN_ID: Record<number, CircleBlockchain> = {
  [MAINNET_CHAIN_ID]: 'ARB',
  [TESTNET_CHAIN_ID]: 'ARB-SEPOLIA',
  [ARC_TESTNET_CHAIN_ID]: 'ARC-TESTNET',
}

const HOP_BLOCKCHAIN_BY_CHAIN_ID: Record<number, CircleBlockchain> = {
  [ETH_SEPOLIA_CHAIN_ID]: 'ETH-SEPOLIA',
  [BASE_SEPOLIA_CHAIN_ID]: 'BASE-SEPOLIA',
  [AVAX_FUJI_CHAIN_ID]: 'AVAX-FUJI',
  // Arb Sepolia is both a Fist login chain and a CCTP source.
  [TESTNET_CHAIN_ID]: 'ARB-SEPOLIA',
}

const BLOCKCHAIN_BY_CHAIN_ID: Record<number, CircleBlockchain> = {
  ...HOP_BLOCKCHAIN_BY_CHAIN_ID,
  ...LOGIN_BLOCKCHAIN_BY_CHAIN_ID,
}

const CHAIN_ID_BY_BLOCKCHAIN: Record<CircleBlockchain, number> = {
  ARB: MAINNET_CHAIN_ID,
  'ARB-SEPOLIA': TESTNET_CHAIN_ID,
  'ARC-TESTNET': ARC_TESTNET_CHAIN_ID,
  'ETH-SEPOLIA': ETH_SEPOLIA_CHAIN_ID,
  'BASE-SEPOLIA': BASE_SEPOLIA_CHAIN_ID,
  'AVAX-FUJI': AVAX_FUJI_CHAIN_ID,
}

export function isCircleLoginChainId(chainId: number | null | undefined): boolean {
  if (chainId == null || !Number.isFinite(chainId)) return false
  const id = Math.trunc(chainId)
  return id in LOGIN_BLOCKCHAIN_BY_CHAIN_ID && isSupportedAppChainId(id)
}

export function isCircleHopChainId(chainId: number | null | undefined): boolean {
  if (chainId == null || !Number.isFinite(chainId)) return false
  return Math.trunc(chainId) in HOP_BLOCKCHAIN_BY_CHAIN_ID
}

/** Login ∪ CCTP hop chains Circle can ensure-wallet / switch to. */
export function isCircleSupportedChainId(chainId: number | null | undefined): boolean {
  if (chainId == null || !Number.isFinite(chainId)) return false
  return Math.trunc(chainId) in BLOCKCHAIN_BY_CHAIN_ID
}

export function circleBlockchainFromChainId(chainId: number): CircleBlockchain {
  const mapped = BLOCKCHAIN_BY_CHAIN_ID[Math.trunc(chainId)]
  if (!mapped) {
    throw new Error(`Circle Wallet does not support chain ${chainId}.`)
  }
  return mapped
}

export function chainIdFromCircleBlockchain(blockchain: string): number | null {
  if (blockchain in CHAIN_ID_BY_BLOCKCHAIN) {
    return CHAIN_ID_BY_BLOCKCHAIN[blockchain as CircleBlockchain]
  }
  return null
}

/** Resolve viem chain for Circle switch (app login chains + CCTP hop sources). */
export function getCircleSwitchChainById(chainId: number | null | undefined): Chain | null {
  if (!isCircleSupportedChainId(chainId)) return null
  return getWalletSwitchChainById(chainId)
}
