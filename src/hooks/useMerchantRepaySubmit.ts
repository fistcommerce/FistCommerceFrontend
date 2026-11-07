import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  merchantRepayPaths,
  merchantRepaySubmitButtonLabel,
  merchantRepaySubmitStatusMessage,
  MERCHANT_REPAY_ON_CHAIN_UNAVAILABLE,
  type MerchantRepaySubmitPhase,
} from '@/components/dashboard/merchant/repay/repayFlowConfig'
import { postMerchantRepaymentSubmit } from '@/api/payout'
import type { MerchantRepayLoanContext } from '@/hooks/useMerchantRepayLoanContext'
import { useIsStellarTestnetMode } from '@/hooks/usePreferredAppNetwork'
import { useTestnetContracts } from '@/hooks/useTestnetContracts'
import { useWallet } from '@/hooks/useWallet'
import { fistUsdToStroops } from '@/stellar/reads'
import { repayTradeCreditReceivable } from '@/stellar/poolWrites'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { refreshMerchantReceivables } from '@/store/slices/merchantReceivablesSlice'
import { toAppUserFacingError } from '@/errors/toAppUserFacingError'

type UseMerchantRepaySubmitParams = {
  repayContext: MerchantRepayLoanContext
  paymentAmount: number
  receivableName?: string
}

export function useMerchantRepaySubmit({
  repayContext,
  paymentAmount,
  receivableName,
}: UseMerchantRepaySubmitParams) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const dispatch = useAppDispatch()
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const stellarMode = useIsStellarTestnetMode()
  const { address: stellarAddress } = useWallet()
  const contracts = useTestnetContracts()

  const [phase, setPhase] = useState<MerchantRepaySubmitPhase>('idle')
  const [error, setError] = useState<string | null>(null)

  const needsApproval = stellarMode ? false : contracts.needsRepaymentApproval(paymentAmount)
  const isBusy = phase !== 'idle' || (!stellarMode && contracts.isWritePending)
  const stellarReceivableId =
    repayContext.stellarReceivableId?.trim() ||
    (typeof repayContext.onChainReceivableId === 'string' &&
    !repayContext.onChainReceivableId.startsWith('0x')
      ? repayContext.onChainReceivableId
      : null)
  const canSubmitStellar =
    Boolean(stellarAddress) &&
    Boolean(stellarReceivableId) &&
    paymentAmount > 0 &&
    (repayContext.amountOwedHuman == null || paymentAmount <= repayContext.amountOwedHuman)
  const disabled = isBusy || (stellarMode ? !canSubmitStellar : !repayContext.canRepayOnChain)

  const submit = useCallback(async () => {
    setError(null)

    const { loanId } = repayContext
    const paths = merchantRepayPaths(loanId)

    if (stellarMode) {
      const receivableId = stellarReceivableId
      if (!stellarAddress) {
        setError('Connect your Stellar wallet to repay.')
        return
      }
      if (!receivableId) {
        setError(MERCHANT_REPAY_ON_CHAIN_UNAVAILABLE)
        return
      }
      try {
        setPhase('repaying')
        const { hash: txHash } = await repayTradeCreditReceivable({
          payer: stellarAddress,
          receivableId,
          amountHuman: paymentAmount,
        })
        // Sync DB status/repaid_amount from on-chain Settled (wallet already signed).
        try {
          await postMerchantRepaymentSubmit(
            accessToken,
            receivableId,
            fistUsdToStroops(paymentAmount),
            { txHash },
          )
        } catch (syncErr) {
          console.warn('Stellar repay on-chain ok but DB sync failed', syncErr)
        }
        void dispatch(refreshMerchantReceivables())
        void queryClient.invalidateQueries({ queryKey: ['loan-details'] })
        navigate(paths.detail, {
          replace: true,
          state: { receivableName, paymentAmount, txHash },
        })
      } catch (e) {
        navigate(paths.failure, {
          replace: true,
          state: {
            message: toAppUserFacingError(e, {
              fallback: 'Your repayment could not be completed. Please try again.',
              context: 'repay',
            }),
            receivableName,
            paymentAmount,
          },
        })
      } finally {
        setPhase('idle')
      }
      return
    }

    const gate = contracts.canRepayReceivable(
      paymentAmount,
      repayContext.onChainReceivableId,
      repayContext.amountOwedHuman,
    )
    if (!gate.ok) {
      setError(gate.message ?? 'Cannot repay.')
      return
    }
    if (!repayContext.onChainReceivableId) {
      setError(MERCHANT_REPAY_ON_CHAIN_UNAVAILABLE)
      return
    }

    try {
      const txHash = await contracts.executeMerchantRepayment(
        paymentAmount,
        repayContext.onChainReceivableId,
        (next) => setPhase(next),
      )

      void dispatch(refreshMerchantReceivables())
      void queryClient.invalidateQueries({ queryKey: ['loan-details'] })
      navigate(paths.detail, {
        replace: true,
        state: {
          receivableName,
          paymentAmount,
          txHash,
        },
      })
    } catch (e) {
      navigate(paths.failure, {
        replace: true,
        state: {
          message: toAppUserFacingError(e, {
            fallback: 'Your repayment could not be completed. Please try again.',
            context: 'repay',
          }),
          receivableName,
          paymentAmount,
        },
      })
    } finally {
      setPhase('idle')
    }
  }, [
    accessToken,
    contracts,
    dispatch,
    navigate,
    queryClient,
    paymentAmount,
    receivableName,
    repayContext,
    stellarAddress,
    stellarMode,
    stellarReceivableId,
  ])

  return {
    submit,
    phase,
    error,
    clearError: () => setError(null),
    disabled,
    buttonLabel: merchantRepaySubmitButtonLabel(phase, needsApproval),
    statusMessage: merchantRepaySubmitStatusMessage(phase, needsApproval),
  }
}
