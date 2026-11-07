import {
  type AppNetworkMode,
  type NetworkCapability,
  hasCapability,
  isStellarTestnetPreferred,
  readPreferredAppNetwork,
} from '@/contract_config/networkCapabilities'
import { usePreferredAppNetwork } from '@/hooks/usePreferredAppNetwork'

export function resolveAppNetworkMode(): AppNetworkMode {
  if (isStellarTestnetPreferred()) return 'stellar-testnet'
  return readPreferredAppNetwork()
}

export function useHasCapability(cap: NetworkCapability): boolean {
  return hasCapability(usePreferredAppNetwork(), cap)
}

export function useIsStellarMode(): boolean {
  return usePreferredAppNetwork() === 'stellar-testnet'
}

/** @deprecated Use useIsStellarMode */
export function useIsSorobanMode(): boolean {
  return useIsStellarMode()
}
