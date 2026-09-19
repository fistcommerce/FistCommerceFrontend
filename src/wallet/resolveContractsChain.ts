import { DEFAULT_APP_CHAIN, resolveActiveAppChain } from '@/wallet/appChain'
import type { Chain } from 'viem'

/**
 * Resolve which app-chain deployment to read contracts from.
 * Prefer the live wallet when it is a Fist login/app chain; otherwise use auth
 * (e.g. wallet parked on a CCTP hop chain during funding).
 */
export function resolveContractsChain(params: {
  walletChainId: number | null | undefined
  authChainId: number | null | undefined
}): Chain {
  const fromWallet = resolveActiveAppChain(params.walletChainId)
  if (fromWallet) return fromWallet
  const fromAuth = resolveActiveAppChain(params.authChainId)
  if (fromAuth) return fromAuth
  return DEFAULT_APP_CHAIN
}
