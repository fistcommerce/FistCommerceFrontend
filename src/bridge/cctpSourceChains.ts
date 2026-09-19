import { avalancheFuji, baseSepolia, sepolia, type Chain } from 'viem/chains'

import { getAppChainById } from '@/wallet/appChain'

/**
 * Extra EVM chains used only for temporary CCTP burns (not Fist login / contracts).
 * Must stay in sync with backend `/bridge/config/` sources that Bridge Kit supports.
 */
export const CCTP_HOP_SOURCE_CHAINS: readonly Chain[] = [sepolia, baseSepolia, avalancheFuji]

export function getCctpHopSourceChainById(chainId: number | null | undefined): Chain | null {
  if (chainId == null || !Number.isFinite(chainId)) return null
  const id = Math.trunc(chainId)
  return CCTP_HOP_SOURCE_CHAINS.find((c) => c.id === id) ?? null
}

/** App chains + CCTP hop sources — anything we may `wallet_switchEthereumChain` to. */
export function getWalletSwitchChainById(chainId: number | null | undefined): Chain | null {
  return getAppChainById(chainId) ?? getCctpHopSourceChainById(chainId)
}

export function isWalletSwitchChainId(chainId: number | null | undefined): boolean {
  return getWalletSwitchChainById(chainId) != null
}
