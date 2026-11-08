import {
  isLoanLifecycleEligibleForRepayment,
  type LoanDetailsResponse,
} from '@/api/loanDetails'
import { isStellarTestnetPreferred } from '@/contract_config/networkCapabilities'
import { fetchReceivablePayoutStatus } from '@/api/payout'
import { parseMoneyToHuman } from '@/utils/mapLoanDetailsToRepayReviewView'
import { normalizeReceivableIdToBytes32 } from '@/utils/receivableId'
import { isReceivableStageEligibleForRepayment, ReceivableStage } from '@/types/receivables'

export type MerchantReceivableRepayState = {
  /** Merchant has received loan disbursement on-chain. */
  isPaidOutToMerchant: boolean
  /** Show enabled Repay Loan CTA. */
  canRepay: boolean
  /** Shown when repay is disabled (e.g. not disbursed, fully repaid). */
  disabledReason: string | null
  amountOwedHuman: number | null
}

const REPAY_DISABLED_FULLY_REPAID = 'This loan has been fully repaid.'
const REPAY_DISABLED_NO_BALANCE = 'There is no outstanding balance to repay.'
const REPAY_DISABLED_NOT_DISBURSED =
  'Repayment is available after loan funds have been disbursed to you.'
const REPAY_DISABLED_NOT_READY = 'This loan is not ready for repayment yet.'

export function validateMerchantRepayAmount(
  amount: number,
  maxOwedHuman: number | null | undefined,
): string | null {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Enter an amount greater than zero.'
  }
  if (
    maxOwedHuman != null &&
    Number.isFinite(maxOwedHuman) &&
    amount > maxOwedHuman + 1e-9
  ) {
    return `Amount cannot exceed ${maxOwedHuman.toLocaleString('en-US', { maximumFractionDigits: 2 })} owed.`
  }
  return null
}

export function clampMerchantRepayAmount(
  amount: number,
  maxOwedHuman: number | null | undefined,
): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  if (maxOwedHuman == null || !Number.isFinite(maxOwedHuman) || maxOwedHuman <= 0) {
    return amount
  }
  return Math.min(amount, maxOwedHuman)
}

async function resolvePaidOutToMerchant(
  accessToken: string,
  lifecycleStatus: string,
  onChainReceivableId: `0x${string}` | null,
): Promise<boolean> {
  const status = lifecycleStatus.trim().toLowerCase()
  if (status === 'matured' || status === 'defaulted' || status === 'repaid') return true
  if (status === 'paid_out') return true
  // Stellar Track A: fund already disbursed even if DB still says funded.
  if (status === 'funded' && isStellarTestnetPreferred()) return true
  if (!onChainReceivableId) return false
  try {
    return (await fetchReceivablePayoutStatus(accessToken, onChainReceivableId)).isPaidOut
  } catch {
    return status === 'paid_out' || (status === 'funded' && isStellarTestnetPreferred())
  }
}

export function isLoanFullyRepaid(api: LoanDetailsResponse): boolean {
  const status = api.lifecycle.status?.trim().toLowerCase() ?? ''
  if (status === 'repaid') return true
  const amountOwed = parseMoneyToHuman(api.summary.amountOwed)
  if (amountOwed === null || amountOwed > 0) return false
  return (
    status === 'paid_out' ||
    status === 'matured' ||
    status === 'defaulted' ||
    status === 'repaid'
  )
}

/** Gate merchant repay from loan details + optional payout status check. */
export async function resolveMerchantReceivableRepayState(
  accessToken: string,
  api: LoanDetailsResponse,
): Promise<MerchantReceivableRepayState> {
  const lifecycleStatus = api.lifecycle.status
  const amountOwedHuman = parseMoneyToHuman(api.summary.amountOwed)
  const onChainReceivableId = normalizeReceivableIdToBytes32(api.receivable.receivableId)
  const status = lifecycleStatus.trim().toLowerCase()

  if (status === 'repaid' || isLoanFullyRepaid(api)) {
    return {
      isPaidOutToMerchant: true,
      canRepay: false,
      disabledReason: REPAY_DISABLED_FULLY_REPAID,
      amountOwedHuman,
    }
  }

  const isPaidOutToMerchant = await resolvePaidOutToMerchant(
    accessToken,
    lifecycleStatus,
    onChainReceivableId,
  )

  if (!isPaidOutToMerchant) {
    return {
      isPaidOutToMerchant: false,
      canRepay: false,
      disabledReason: REPAY_DISABLED_NOT_DISBURSED,
      amountOwedHuman,
    }
  }

  if (!isLoanLifecycleEligibleForRepayment(lifecycleStatus)) {
    return {
      isPaidOutToMerchant: true,
      canRepay: false,
      disabledReason: REPAY_DISABLED_NOT_READY,
      amountOwedHuman,
    }
  }

  return {
    isPaidOutToMerchant: true,
    canRepay: true,
    disabledReason: null,
    amountOwedHuman,
  }
}

/** Demo receivable detail rows (no payout API). */
export function demoRepayStateFromStage(
  stage: ReceivableStage,
  amountOwedRaw: string | null | undefined,
): MerchantReceivableRepayState {
  const amountOwedHuman = parseMoneyToHuman(amountOwedRaw)
  const repaid = stage === ReceivableStage.Repaid
  const isPaidOutToMerchant =
    stage === ReceivableStage.Matured ||
    stage === ReceivableStage.Defaulted ||
    repaid

  if (repaid || (amountOwedHuman !== null && amountOwedHuman <= 0 && isPaidOutToMerchant)) {
    return {
      isPaidOutToMerchant: true,
      canRepay: false,
      disabledReason: REPAY_DISABLED_FULLY_REPAID,
      amountOwedHuman,
    }
  }

  if (amountOwedHuman !== null && amountOwedHuman <= 0) {
    return {
      isPaidOutToMerchant,
      canRepay: false,
      disabledReason: REPAY_DISABLED_NO_BALANCE,
      amountOwedHuman,
    }
  }

  if (!isPaidOutToMerchant) {
    return {
      isPaidOutToMerchant: false,
      canRepay: false,
      disabledReason: REPAY_DISABLED_NOT_DISBURSED,
      amountOwedHuman,
    }
  }

  if (!isReceivableStageEligibleForRepayment(stage)) {
    return {
      isPaidOutToMerchant: true,
      canRepay: false,
      disabledReason: REPAY_DISABLED_NOT_READY,
      amountOwedHuman,
    }
  }

  return {
    isPaidOutToMerchant: true,
    canRepay: true,
    disabledReason: null,
    amountOwedHuman,
  }
}
