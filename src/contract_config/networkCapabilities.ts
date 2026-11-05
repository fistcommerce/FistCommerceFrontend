/**
 * Capability map for Fist Commerce networks.
 * Soroban Testnet only enables features backed by deployed Soroban contracts.
 */

export type AppNetworkMode = 'local' | 'testnet' | 'mainnet' | 'soroban-testnet'

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
const SOROBAN: ReadonlySet<NetworkCapability> = new Set([
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
  // bridge + nftKyc remain EVM-only / hidden on Soroban
])

export function capabilitiesFor(mode: AppNetworkMode): ReadonlySet<NetworkCapability> {
  if (mode === 'soroban-testnet') return SOROBAN
  return EVM_FULL
}

export function hasCapability(mode: AppNetworkMode, cap: NetworkCapability): boolean {
  return capabilitiesFor(mode).has(cap)
}

const PREFERRED_KEY = 'fistcommerce.preferredNetwork'

export type PreferredNetwork = 'testnet' | 'mainnet' | 'soroban-testnet'

export function readPreferredAppNetwork(): PreferredNetwork {
  try {
    const raw = localStorage.getItem(PREFERRED_KEY)
    if (raw === 'mainnet' || raw === 'testnet' || raw === 'soroban-testnet') return raw
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
}

export function isSorobanTestnetPreferred(): boolean {
  return readPreferredAppNetwork() === 'soroban-testnet'
}
