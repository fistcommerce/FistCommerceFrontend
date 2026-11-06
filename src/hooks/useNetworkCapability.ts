import {
  type AppNetworkMode,
  type NetworkCapability,
  hasCapability,
  isStellarTestnetPreferred,
  readPreferredAppNetwork,
} from '@/contract_config/networkCapabilities'

export function resolveAppNetworkMode(): AppNetworkMode {
  if (isStellarTestnetPreferred()) return 'stellar-testnet'
  return readPreferredAppNetwork()
}

export function useHasCapability(cap: NetworkCapability): boolean {
  return hasCapability(resolveAppNetworkMode(), cap)
}

export function useIsStellarMode(): boolean {
  return readPreferredAppNetwork() === 'stellar-testnet'
}

/** @deprecated Use useIsStellarMode */
export function useIsSorobanMode(): boolean {
  return useIsStellarMode()
}
