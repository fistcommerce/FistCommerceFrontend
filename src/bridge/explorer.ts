import { blockExplorerTxUrl } from '@/api/payout'
import { ARC_TESTNET_CHAIN_ID, TESTNET_CHAIN_ID } from '@/contract_config/contractNetwork'
import {
  AVAX_FUJI_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
  ETH_SEPOLIA_CHAIN_ID,
} from '@/circle/chainMap'

const EXPLORER_BY_CHAIN_ID: Record<number, string> = {
  [ETH_SEPOLIA_CHAIN_ID]: 'https://sepolia.etherscan.io',
  [BASE_SEPOLIA_CHAIN_ID]: 'https://sepolia.basescan.org',
  [AVAX_FUJI_CHAIN_ID]: 'https://testnet.snowtrace.io',
  [TESTNET_CHAIN_ID]: 'https://sepolia.arbiscan.io',
  [ARC_TESTNET_CHAIN_ID]: 'https://testnet.arcscan.app',
}

export function explorerBaseForChainId(chainId: number | null | undefined): string | null {
  if (chainId == null || !Number.isFinite(chainId)) return null
  return EXPLORER_BY_CHAIN_ID[Math.trunc(chainId)] ?? null
}

export function explorerTxUrlForChain(
  chainId: number | null | undefined,
  txHash: string | null | undefined,
): string | null {
  const base = explorerBaseForChainId(chainId)
  if (!base || !txHash?.trim()) return null
  return blockExplorerTxUrl(base, txHash)
}

export function sourceChainLabel(chainId: number | null | undefined, fallback?: string): string {
  switch (chainId) {
    case ETH_SEPOLIA_CHAIN_ID:
      return 'Ethereum Sepolia'
    case BASE_SEPOLIA_CHAIN_ID:
      return 'Base Sepolia'
    case AVAX_FUJI_CHAIN_ID:
      return 'Avalanche Fuji'
    case TESTNET_CHAIN_ID:
      return 'Arbitrum Sepolia'
    case ARC_TESTNET_CHAIN_ID:
      return 'Arc Testnet'
    default:
      return fallback?.trim() || (chainId != null ? `Chain ${chainId}` : 'Unknown network')
  }
}
