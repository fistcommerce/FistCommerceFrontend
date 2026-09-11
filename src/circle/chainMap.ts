import {
  ARC_TESTNET_CHAIN_ID,
  MAINNET_CHAIN_ID,
  TESTNET_CHAIN_ID,
} from '@/contract_config/contractNetwork'
import { isSupportedAppChainId } from '@/wallet/appChain'

export type CircleBlockchain = 'ARB' | 'ARB-SEPOLIA' | 'ARC-TESTNET'

const BLOCKCHAIN_BY_CHAIN_ID: Record<number, CircleBlockchain> = {
  [MAINNET_CHAIN_ID]: 'ARB',
  [TESTNET_CHAIN_ID]: 'ARB-SEPOLIA',
  [ARC_TESTNET_CHAIN_ID]: 'ARC-TESTNET',
}

const CHAIN_ID_BY_BLOCKCHAIN: Record<CircleBlockchain, number> = {
  ARB: MAINNET_CHAIN_ID,
  'ARB-SEPOLIA': TESTNET_CHAIN_ID,
  'ARC-TESTNET': ARC_TESTNET_CHAIN_ID,
}

export function circleBlockchainFromChainId(chainId: number): CircleBlockchain {
  const mapped = BLOCKCHAIN_BY_CHAIN_ID[chainId]
  if (!mapped || !isSupportedAppChainId(chainId)) {
    throw new Error(`Circle Wallet does not support chain ${chainId}.`)
  }
  return mapped
}

export function chainIdFromCircleBlockchain(blockchain: string): number | null {
  if (blockchain === 'ARB' || blockchain === 'ARB-SEPOLIA' || blockchain === 'ARC-TESTNET') {
    return CHAIN_ID_BY_BLOCKCHAIN[blockchain]
  }
  return null
}

export function isCircleSupportedChainId(chainId: number | null | undefined): boolean {
  if (chainId == null || !Number.isFinite(chainId)) return false
  const id = Math.trunc(chainId)
  return id in BLOCKCHAIN_BY_CHAIN_ID && isSupportedAppChainId(id)
}
