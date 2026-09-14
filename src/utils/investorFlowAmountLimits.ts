import { displayDashboardMetricString } from '@/api/metrics'
import {
  canMintTestTokens,
  CIRCLE_TESTNET_FAUCET_URL,
  getAcceptedTokenDisplayName,
  isArcTestnetContractNetwork,
} from '@/contract_config/contractNetwork'
import { store } from '@/store'

export const INSUFFICIENT_BALANCE_ORDER_HINT = 'Insufficient balance to fulfil order.'

function activeChainIdForCopy(): number | null {
  try {
    const { auth, wallet } = store.getState()
    return auth.chainId ?? wallet.chainId ?? null
  } catch {
    return null
  }
}

export function isInvestAmountOverMax(
  amount: number,
  maxHuman: number | null | undefined,
): boolean {
  if (maxHuman == null || !Number.isFinite(maxHuman) || maxHuman <= 0) return false
  return Number.isFinite(amount) && amount > maxHuman + 1e-9
}

export function resolveInvestFlowContinueHint(
  amount: number,
  maxHuman: number | null | undefined,
  validationError?: string | null,
): string | null {
  if (isInvestAmountOverMax(amount, maxHuman)) return INSUFFICIENT_BALANCE_ORDER_HINT
  if (validationError) return validationError
  if (!Number.isFinite(amount) || amount <= 0) return 'Enter an amount greater than zero.'
  return null
}

export function validateInvestDepositAmount(
  amount: number,
  maxWalletHuman: number | null | undefined,
): string | null {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Enter an amount greater than zero.'
  }
  if (maxWalletHuman == null) return null
  if (maxWalletHuman <= 0) {
    const chainId = activeChainIdForCopy()
    const token = getAcceptedTokenDisplayName(chainId)
    if (canMintTestTokens(chainId)) {
      return `Your wallet has no ${token} available to deposit. Mint test tokens first.`
    }
    if (isArcTestnetContractNetwork(chainId)) {
      return `Your wallet has no ${token} available to deposit. Get Arc Testnet USDC from ${CIRCLE_TESTNET_FAUCET_URL}`
    }
    return `Your wallet has no ${token} available to deposit.`
  }
  if (amount > maxWalletHuman + 1e-9) {
    return `Amount cannot exceed your wallet balance of ${displayDashboardMetricString(maxWalletHuman)}.`
  }
  return null
}

export function validateInvestWithdrawAmount(
  amount: number,
  maxPoolHuman: number | null | undefined,
): string | null {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Enter an amount greater than zero.'
  }
  if (maxPoolHuman == null) return null
  if (maxPoolHuman <= 0) {
    return 'No on-chain pool position yet — invest in the pool first.'
  }
  if (amount > maxPoolHuman + 1e-9) {
    return `Amount cannot exceed your investment balance of ${displayDashboardMetricString(maxPoolHuman)}.`
  }
  return null
}

export function clampToMaxHuman(amount: number, maxHuman: number | null | undefined): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  if (maxHuman == null || !Number.isFinite(maxHuman) || maxHuman <= 0) return amount
  return Math.min(amount, maxHuman)
}

export function filterQuickAmountsByMax(
  quickAmounts: readonly number[],
  maxHuman: number | null | undefined,
): number[] {
  if (maxHuman == null || !Number.isFinite(maxHuman) || maxHuman <= 0) return [...quickAmounts]
  return quickAmounts.filter((v) => v <= maxHuman + 1e-9)
}
