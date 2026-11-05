import {
  hasCapability,
  isSorobanTestnetPreferred,
  type NetworkCapability,
  readPreferredAppNetwork,
  type AppNetworkMode,
} from '@/contract_config/networkCapabilities'
import { getContractNetworkMode } from '@/contract_config/contractNetwork'

export function useAppNetworkMode(): AppNetworkMode {
  if (isSorobanTestnetPreferred()) return 'soroban-testnet'
  return getContractNetworkMode()
}

export function useNetworkCapability(cap: NetworkCapability): boolean {
  return hasCapability(useAppNetworkMode(), cap)
}

export function useIsSorobanMode(): boolean {
  return readPreferredAppNetwork() === 'soroban-testnet'
}
