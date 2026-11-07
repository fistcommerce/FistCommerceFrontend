import { getActiveDeploymentAddresses } from '@/contract_config/deployment'
import { getSorobanDeployment } from '@/stellar/deployment'
import { store } from '@/store'

type DeploymentAddresses = {
  MockERC20: { address: string }
  ProtocolController: { address: string }
  investorVerificationNFT: { address: string }
  loanVerificationNFT: { address: string }
  merchantVerificationNFT: { address: string }
  ComplianceRegistry: { address: string }
  AllocationController: { address: string }
  PayoutRouter: { address: string }
  FundingPool: { address: string }
}

function deploymentAddresses(): DeploymentAddresses {
  try {
    const chainId = store.getState().auth.chainId ?? store.getState().wallet.chainId
    return getActiveDeploymentAddresses(chainId) as DeploymentAddresses
  } catch {
    return getActiveDeploymentAddresses() as DeploymentAddresses
  }
}

export type ProtocolRiskTier = {
  id: number
  interestPercent: string
  maxTenorDays: string
  active: boolean
}

export type ProtocolSafetyState = {
  paused: boolean
  depositsPaused: boolean
  withdrawalsPaused: boolean
  fundingPaused: boolean
  repaymentsPaused: boolean
}

export type RiskAllocationState = {
  maxMerchantPercent: string
  bankerYearDays: string
  maxTenorRatePercent: string
  tiers: ProtocolRiskTier[]
}

export type FundingPoolSettingsState = {
  minDeposit: string
  payoutRouter: string
  acceptedToken: string
  withdrawalRequestDurationSeconds: number
  withdrawalRequestGapSeconds: number
}

export type PayoutRouterSettingsState = {
  fundingPool: string
  allocator: string
  acceptedToken: string
  minRepayment: string
}

export type RegistryRow = {
  label: string
  value: string
}

export type RegistryGroup = {
  contract: string
  rows: RegistryRow[]
}

export type ProtocolConstantRow = {
  label: string
  value: string
  contract: string
  note: string
}

const ADMIN_PLACEHOLDER = '0x0000000000000000000000000000000000000001'

export const DEFAULT_PROTOCOL_SAFETY: ProtocolSafetyState = {
  paused: false,
  depositsPaused: false,
  withdrawalsPaused: false,
  fundingPaused: false,
  repaymentsPaused: false,
}

export const DEFAULT_RISK_ALLOCATION: RiskAllocationState = {
  maxMerchantPercent: '50',
  bankerYearDays: '360',
  maxTenorRatePercent: '50',
  tiers: [{ id: 1, interestPercent: '10', maxTenorDays: '90', active: true }],
}

/** EVM fallbacks only — prefer live API / chain-aware builders when rendering. */
export function buildDefaultFundingPool(isStellar = false): FundingPoolSettingsState {
  if (isStellar) {
    const d = getSorobanDeployment()
    return {
      minDeposit: '100',
      payoutRouter: d.track_b?.payout_router ?? '',
      acceptedToken: d.test_asset.sac_contract_id,
      withdrawalRequestDurationSeconds: 0,
      withdrawalRequestGapSeconds: 0,
    }
  }
  const d = deploymentAddresses()
  return {
    minDeposit: '100',
    payoutRouter: d.PayoutRouter.address,
    acceptedToken: d.MockERC20.address,
    withdrawalRequestDurationSeconds: 172800,
    withdrawalRequestGapSeconds: 1200,
  }
}

export function buildDefaultPayoutRouter(isStellar = false): PayoutRouterSettingsState {
  if (isStellar) {
    const d = getSorobanDeployment()
    return {
      fundingPool: d.trade_credit_pool.contract_id,
      allocator: d.track_b?.receivable_allocator ?? '',
      acceptedToken: d.test_asset.sac_contract_id,
      minRepayment: '0',
    }
  }
  const d = deploymentAddresses()
  return {
    fundingPool: d.FundingPool.address,
    allocator: d.AllocationController.address,
    acceptedToken: d.MockERC20.address,
    minRepayment: '0',
  }
}

/** @deprecated Prefer buildDefaultFundingPool(isStellar). */
export const DEFAULT_FUNDING_POOL: FundingPoolSettingsState = buildDefaultFundingPool(false)

/** @deprecated Prefer buildDefaultPayoutRouter(isStellar). */
export const DEFAULT_PAYOUT_ROUTER: PayoutRouterSettingsState = buildDefaultPayoutRouter(false)

export function buildEvmContractRegistry(): RegistryGroup[] {
  const d = deploymentAddresses()
  return [
    {
      contract: 'ProtocolController',
      rows: [{ label: 'admin', value: ADMIN_PLACEHOLDER }],
    },
    {
      contract: 'ComplianceRegistry',
      rows: [
        { label: 'admin', value: ADMIN_PLACEHOLDER },
        { label: 'merchantReceivable', value: d.merchantVerificationNFT.address },
        { label: 'investorReceivable', value: d.investorVerificationNFT.address },
        { label: 'protocolController', value: d.ProtocolController.address },
      ],
    },
    {
      contract: 'AllocationController',
      rows: [
        { label: 'admin', value: ADMIN_PLACEHOLDER },
        { label: 'complianceRegistry', value: d.ComplianceRegistry.address },
        { label: 'protocolController', value: d.ProtocolController.address },
        { label: 'receivableToken', value: d.loanVerificationNFT.address },
        { label: 'maxMerchantBps (deploy)', value: '5000 (50%)' },
      ],
    },
    {
      contract: 'FundingPool',
      rows: [
        { label: 'admin', value: ADMIN_PLACEHOLDER },
        { label: 'allocator', value: d.AllocationController.address },
        { label: 'complianceRegistry', value: d.ComplianceRegistry.address },
        { label: 'payoutRouter', value: d.PayoutRouter.address },
        { label: 'protocolController', value: d.ProtocolController.address },
        { label: 'acceptedToken', value: d.MockERC20.address },
      ],
    },
    {
      contract: 'PayoutRouter',
      rows: [
        { label: 'admin', value: ADMIN_PLACEHOLDER },
        { label: 'fundingPool', value: d.FundingPool.address },
        { label: 'allocator', value: d.AllocationController.address },
        { label: 'acceptedToken', value: d.MockERC20.address },
        { label: 'protocolController', value: d.ProtocolController.address },
      ],
    },
    {
      contract: 'ReceivableToken',
      rows: [
        { label: 'name', value: 'Fist Receivable' },
        { label: 'symbol', value: 'FREC' },
        { label: 'transfers', value: 'Disabled (non-zero transfers revert)' },
      ],
    },
  ]
}

export function buildStellarContractRegistry(adminAddress = ''): RegistryGroup[] {
  const d = getSorobanDeployment()
  const pool = d.trade_credit_pool.contract_id
  const attestation = d.attestation_registry.contract_id
  const sac = d.test_asset.sac_contract_id
  const trackB = d.track_b ?? {}
  const admin = adminAddress.trim() || 'STELLAR_ADMIN'

  return [
    {
      contract: 'TradeCreditPool',
      rows: [
        { label: 'address', value: pool },
        { label: 'admin (STELLAR_ADMIN)', value: admin },
        { label: 'acceptedToken (SAC)', value: sac },
        { label: 'tokenCode', value: d.test_asset.code },
        { label: 'tokenIssuer', value: d.test_asset.issuer },
        { label: 'payoutRouter', value: trackB.payout_router ?? '' },
        { label: 'allocator', value: trackB.receivable_allocator ?? '' },
      ],
    },
    {
      contract: 'AttestationRegistry',
      rows: [
        { label: 'address', value: attestation },
        { label: 'admin (STELLAR_ADMIN)', value: admin },
      ],
    },
    {
      contract: 'ProtocolController',
      rows: [
        { label: 'address', value: trackB.protocol_controller ?? '' },
        { label: 'admin (STELLAR_ADMIN)', value: admin },
      ],
    },
    {
      contract: 'ReceivableAllocator',
      rows: [
        { label: 'address', value: trackB.receivable_allocator ?? '' },
        { label: 'alias', value: 'AllocationController' },
        { label: 'admin (STELLAR_ADMIN)', value: admin },
        { label: 'protocolController', value: trackB.protocol_controller ?? '' },
        { label: 'receivableToken', value: trackB.receivable_token ?? '' },
      ],
    },
    {
      contract: 'PayoutRouter',
      rows: [
        { label: 'address', value: trackB.payout_router ?? '' },
        { label: 'fundingPool (TradeCreditPool)', value: pool },
        { label: 'allocator', value: trackB.receivable_allocator ?? '' },
        { label: 'acceptedToken (SAC)', value: sac },
        { label: 'protocolController', value: trackB.protocol_controller ?? '' },
      ],
    },
    {
      contract: 'ReceivableToken',
      rows: [
        { label: 'address', value: trackB.receivable_token ?? '' },
        { label: 'name', value: 'Fist Receivable' },
        { label: 'symbol', value: 'FREC' },
      ],
    },
    {
      contract: 'FistMultisig',
      rows: [
        { label: 'address', value: trackB.fist_multisig ?? '' },
        {
          label: 'note',
          value: 'Track B / future governance; Track A uses STELLAR_ADMIN directly.',
        },
      ],
    },
  ]
}

export function buildContractRegistry(isStellar: boolean, adminAddress = ''): RegistryGroup[] {
  return isStellar ? buildStellarContractRegistry(adminAddress) : buildEvmContractRegistry()
}

/** @deprecated Prefer buildContractRegistry(isStellar). */
export const DEFAULT_CONTRACT_REGISTRY: RegistryGroup[] = buildEvmContractRegistry()

export const DEFAULT_PROTOCOL_CONSTANTS: ProtocolConstantRow[] = []
