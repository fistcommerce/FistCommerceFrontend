/** Deploy / session network mode derived from chain id or legacy env. */
export type ContractNetworkMode = 'local' | 'testnet' | 'mainnet' | 'arc-testnet'

const CONTRACT_NETWORK_ENV_KEY = 'VITE_CONTRACT_NETWORK'

/** Arbitrum One */
export const MAINNET_CHAIN_ID = 42161
/** Arbitrum Sepolia */
export const TESTNET_CHAIN_ID = 421614
/** Arc Testnet */
export const ARC_TESTNET_CHAIN_ID = 5042002

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
  if (id === ARC_TESTNET_CHAIN_ID) return 'arc-testnet'
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

export function isArcTestnetContractNetwork(chainId?: number | null): boolean {
  if (chainId != null) return modeFromChainId(chainId) === 'arc-testnet'
  return false
}

export function getContractNetworkLabel(chainId?: number | null): string {
  const mode = chainId != null ? modeFromChainId(chainId) : getContractNetworkMode()
  switch (mode) {
    case 'local':
      return 'Local contracts'
    case 'mainnet':
      return 'Arbitrum One'
    case 'testnet':
      return 'Arbitrum Sepolia'
    case 'arc-testnet':
      return 'Arc Testnet'
    default:
      return 'Unknown network'
  }
}

/**
 * User-facing chain name for the active (or env-default) network.
 * Prefer passing `chainId` from the wallet / auth session when available.
 */
export function getAppChainDisplayName(chainId?: number | null): string {
  const mode = chainId != null ? modeFromChainId(chainId) : getContractNetworkMode()
  switch (mode) {
    case 'local':
      return 'Local'
    case 'mainnet':
      return 'Arbitrum One'
    case 'testnet':
      return 'Arbitrum Sepolia'
    case 'arc-testnet':
      return 'Arc Testnet'
    default:
      return 'Unknown network'
  }
}

/** Short badge label for session UI. */
export function getNetworkSessionBadgeLabel(chainId: number | null | undefined): string | null {
  const mode = modeFromChainId(chainId)
  if (mode === 'mainnet') return 'Mainnet'
  if (mode === 'testnet') return 'Testnet'
  if (mode === 'arc-testnet') return 'Arc Testnet'
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
    ? 'Unsupported network. Switch to Arbitrum One, Arbitrum Sepolia, or Arc Testnet.'
    : 'Your wallet is on an unsupported network. Switch to Arbitrum One (mainnet), Arbitrum Sepolia (testnet), or Arc Testnet, then try again.'
}

/** Circle public faucet for testnet USDC (including Arc Testnet). */
export const CIRCLE_TESTNET_FAUCET_URL = 'https://faucet.circle.com/'

/**
 * Display name for the pool accepted token.
 * Arbitrum One + Arc Testnet use Circle USDC; local / Arbitrum Sepolia use Mock ERC-20.
 */
export function getAcceptedTokenDisplayName(chainId?: number | null): string {
  if (isMainnetContractNetwork(chainId) || isArcTestnetContractNetwork(chainId)) {
    return 'USDC'
  }
  return 'Mock ERC-20'
}

/**
 * Default decimals before / if on-chain `decimals()` has not resolved.
 * USDC (Arbitrum One + Arc) is 6; mock tokens on local / Sepolia are 18.
 */
export function getAcceptedTokenDefaultDecimals(chainId?: number | null): number {
  if (isMainnetContractNetwork(chainId) || isArcTestnetContractNetwork(chainId)) {
    return 6
  }
  return 18
}

/**
 * In-app MockERC20 mint is available on local Anvil and Arbitrum Sepolia only.
 * Arc Testnet uses Circle's external faucet for native/ERC-20 USDC.
 */
export function canMintTestTokens(chainId?: number | null): boolean {
  if (chainId != null) {
    return isLocalContractNetwork(chainId) || isTestnetContractNetwork(chainId)
  }
  return isLocalContractNetwork() || isTestnetContractNetwork()
}

/** Show the wallets-tab faucet section (in-app mint or external Circle link). */
export function showTestnetFaucetSection(chainId?: number | null): boolean {
  return canMintTestTokens(chainId) || isArcTestnetContractNetwork(chainId)
}
