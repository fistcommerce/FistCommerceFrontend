/**
 * Capability map for Fist Commerce networks.
 * Stellar Testnet only enables features backed by deployed Soroban contracts.
 */

export type AppNetworkMode = 'local' | 'testnet' | 'mainnet' | 'stellar-testnet'

export type NetworkCapability =
  | 'investorDeposit'
  | 'investorWithdraw'
  | 'merchantApplyLoan'
  | 'merchantRepay'
  | 'adminRegisterReceivable'
  | 'adminApproveReceivable'
  | 'adminFundReceivable'
  | 'adminTwoStepPayout'
  | 'adminAttestations'
  | 'adminInvestorAllowlist'
  | 'governanceMultisig'
  | 'protocolPauseSettings'
  | 'riskTier'
  | 'subgraphMetrics'
  | 'bridge'
  | 'nftKyc'
  | 'defaultLossWriteOff'

const EVM_FULL: ReadonlySet<NetworkCapability> = new Set([
  'investorDeposit',
  'investorWithdraw',
  'merchantApplyLoan',
  'merchantRepay',
  'adminRegisterReceivable',
  'adminApproveReceivable',
  'adminFundReceivable',
  'adminTwoStepPayout',
  'adminAttestations',
  'adminInvestorAllowlist',
  'governanceMultisig',
  'protocolPauseSettings',
  'riskTier',
  'subgraphMetrics',
  'bridge',
  'nftKyc',
  'defaultLossWriteOff',
])

/** Track A always; Track B when modules are deployed (enabled here for gated FE). */
const STELLAR: ReadonlySet<NetworkCapability> = new Set([
  'investorDeposit',
  'investorWithdraw',
  'merchantApplyLoan',
  'merchantRepay',
  'adminRegisterReceivable',
  'adminApproveReceivable',
  'adminFundReceivable',
  'adminTwoStepPayout',
  'adminAttestations',
  'adminInvestorAllowlist',
  'governanceMultisig',
  'protocolPauseSettings',
  'riskTier',
  'subgraphMetrics',
  'defaultLossWriteOff',
  // bridge + nftKyc remain EVM-only / hidden on Stellar Testnet
])

export function capabilitiesFor(mode: AppNetworkMode): ReadonlySet<NetworkCapability> {
  if (mode === 'stellar-testnet') return STELLAR
  return EVM_FULL
}

export function hasCapability(mode: AppNetworkMode, cap: NetworkCapability): boolean {
  return capabilitiesFor(mode).has(cap)
}

const PREFERRED_KEY = 'fistcommerce.preferredNetwork'
export const PREFERRED_NETWORK_EVENT = 'fistcommerce:preferred-network'

export type PreferredNetwork = 'testnet' | 'mainnet' | 'stellar-testnet'

export function readPreferredAppNetwork(): PreferredNetwork {
  try {
    const raw = localStorage.getItem(PREFERRED_KEY)
    // Migrate legacy key from earlier Soroban Testnet wording
    if (raw === 'soroban-testnet') {
      writePreferredAppNetwork('stellar-testnet')
      return 'stellar-testnet'
    }
    if (raw === 'mainnet' || raw === 'testnet' || raw === 'stellar-testnet') return raw
  } catch {
    /* ignore */
  }
  return 'testnet'
}

export function writePreferredAppNetwork(choice: PreferredNetwork) {
  try {
    localStorage.setItem(PREFERRED_KEY, choice)
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(PREFERRED_NETWORK_EVENT, { detail: { network: choice } }),
    )
  }
}

export function isStellarTestnetPreferred(): boolean {
  return readPreferredAppNetwork() === 'stellar-testnet'
}

/** @deprecated Use isStellarTestnetPreferred */
export function isSorobanTestnetPreferred(): boolean {
  return isStellarTestnetPreferred()
}
