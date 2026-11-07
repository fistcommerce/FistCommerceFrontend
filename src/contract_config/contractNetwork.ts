import { isStellarChainId, STELLAR_TESTNET_LABEL } from '@/stellar/chain'

/** Deploy / session network mode derived from chain id or legacy env. */
export type ContractNetworkMode = 'local' | 'testnet' | 'mainnet'

const CONTRACT_NETWORK_ENV_KEY = 'VITE_CONTRACT_NETWORK'

/** Arbitrum One */
export const MAINNET_CHAIN_ID = 42161
/** Arbitrum Sepolia */
export const TESTNET_CHAIN_ID = 421614

function readEnvTrim(key: string): string {
  const raw = (import.meta.env as Record<string, string | undefined>)[key]?.trim()
  return raw ?? ''
}

/**
 * Legacy env pin. Prefer wallet chain for deployed networks.
 * `local` still means Anvil-only (single supported chain).
 */
export function getContractNetworkMode(): ContractNetworkMode {
  const raw = readEnvTrim(CONTRACT_NETWORK_ENV_KEY).toLowerCase()
  if (raw === 'local') return 'local'
  if (raw === 'mainnet') return 'mainnet'
  return 'testnet'
}

/** True when the app should only allow the local Anvil chain. */
export function isLocalOnlyDeployMode(): boolean {
  return getContractNetworkMode() === 'local'
}

export function modeFromChainId(chainId: number | null | undefined): ContractNetworkMode | null {
  if (chainId == null || !Number.isFinite(chainId)) return null
  const id = Math.trunc(chainId)
  if (id === MAINNET_CHAIN_ID) return 'mainnet'
  if (id === TESTNET_CHAIN_ID) return 'testnet'
  if (isLocalOnlyDeployMode() && id === Number(readEnvTrim('VITE_LOCAL_CHAIN_ID') || 31337)) {
    return 'local'
  }
  // Any other chain used with local overlay (Anvil default 31337)
  if (id === 31337) return 'local'
  return null
}

export function isLocalContractNetwork(chainId?: number | null): boolean {
  if (chainId != null) return modeFromChainId(chainId) === 'local'
  return getContractNetworkMode() === 'local'
}

export function isTestnetContractNetwork(chainId?: number | null): boolean {
  if (chainId != null) return modeFromChainId(chainId) === 'testnet'
  return getContractNetworkMode() === 'testnet'
}

export function isMainnetContractNetwork(chainId?: number | null): boolean {
  if (chainId != null) return modeFromChainId(chainId) === 'mainnet'
  return getContractNetworkMode() === 'mainnet'
}

export function getContractNetworkLabel(chainId?: number | null): string {
  if (isStellarChainId(chainId)) return STELLAR_TESTNET_LABEL
  const mode = chainId != null ? modeFromChainId(chainId) : getContractNetworkMode()
  switch (mode) {
    case 'local':
      return 'Local contracts'
    case 'mainnet':
      return 'Arbitrum One'
    case 'testnet':
      return 'Arbitrum Sepolia'
    default:
      return 'Unknown network'
  }
}

/**
 * User-facing chain name for the active (or env-default) network.
 * Prefer passing `chainId` from the wallet / auth session when available.
 */
export function getAppChainDisplayName(chainId?: number | null): string {
  if (isStellarChainId(chainId)) return STELLAR_TESTNET_LABEL
  const mode = chainId != null ? modeFromChainId(chainId) : getContractNetworkMode()
  switch (mode) {
    case 'local':
      return 'Local'
    case 'mainnet':
      return 'Arbitrum One'
    case 'testnet':
      return 'Arbitrum Sepolia'
    default:
      return 'Unknown network'
  }
}

/** Short badge label for session UI. */
export function getNetworkSessionBadgeLabel(chainId: number | null | undefined): string | null {
  if (isStellarChainId(chainId)) return 'Stellar'
  const mode = modeFromChainId(chainId)
  if (mode === 'mainnet') return 'Mainnet'
  if (mode === 'testnet') return 'Testnet'
  if (mode === 'local') return 'Local'
  return null
}

/** Copy for wrong-network / unsupported-chain errors. */
export function getUnsupportedNetworkMessage(options?: { short?: boolean }): string {
  if (isLocalOnlyDeployMode()) {
    const name = getAppChainDisplayName()
    return options?.short
      ? `Unsupported network. Switch to ${name}.`
      : `Your wallet is on an unsupported network. Switch to ${name}, then try again.`
  }
  return options?.short
    ? 'Unsupported network. Switch to Arbitrum One or Arbitrum Sepolia.'
    : 'Your wallet is on an unsupported network. Switch to Arbitrum One (mainnet) or Arbitrum Sepolia (testnet), then try again.'
}

/**
 * Display name for the pool accepted token.
 * Mainnet uses native USDC; local/testnet use the mock ERC-20 faucet token.
 */
export function getAcceptedTokenDisplayName(chainId?: number | null): string {
  return isMainnetContractNetwork(chainId) ? 'USDC' : 'Mock ERC-20'
}

/**
 * Default decimals before / if on-chain `decimals()` has not resolved.
 * USDC on Arbitrum One is 6; mock tokens on local/testnet are typically 18.
 */
export function getAcceptedTokenDefaultDecimals(chainId?: number | null): number {
  return isMainnetContractNetwork(chainId) ? 6 : 18
}

/** Test-token mint / faucet is only available on EVM testnets (not mainnet or Stellar). */
export function canMintTestTokens(chainId?: number | null): boolean {
  if (isStellarChainId(chainId)) return false
  return !isMainnetContractNetwork(chainId)
}
