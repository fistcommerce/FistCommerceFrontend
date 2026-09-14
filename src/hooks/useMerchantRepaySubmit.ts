import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { ensureArcUsdcForAction } from '@/bridge/ensureArcUsdc'
import {
  merchantRepayPaths,
  merchantRepaySubmitButtonLabel,
  merchantRepaySubmitStatusMessage,
  MERCHANT_REPAY_ON_CHAIN_UNAVAILABLE,
  type MerchantRepaySubmitPhase,
} from '@/components/dashboard/merchant/repay/repayFlowConfig'
import type {
  MerchantRepayLoanContext,
  MerchantRepayLocationState,
} from '@/hooks/useMerchantRepayLoanContext'
import { useTestnetContracts } from '@/hooks/useTestnetContracts'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { refreshMerchantReceivables } from '@/store/slices/merchantReceivablesSlice'
import { toAppUserFacingError } from '@/errors/toAppUserFacingError'
import { useActiveWallet } from '@/wallet/useActiveWallet'

type UseMerchantRepaySubmitParams = {
  repayContext: MerchantRepayLoanContext
  paymentAmount: number
  receivableName?: string
  usdcSource?: MerchantRepayLocationState['usdcSource']
}

export function useMerchantRepaySubmit({
  repayContext,
  paymentAmount,
  receivableName,
  usdcSource,
}: UseMerchantRepaySubmitParams) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const dispatch = useAppDispatch()
  const contracts = useTestnetContracts()
  const { wallet, address } = useActiveWallet()
  const accessToken = useAppSelector((s) => s.auth?.accessToken ?? null)

  const [phase, setPhase] = useState<MerchantRepaySubmitPhase>('idle')
  const [error, setError] = useState<string | null>(null)

  const needsApproval = contracts.needsRepaymentApproval(paymentAmount)
  const isBusy = phase !== 'idle' || contracts.isWritePending
  const disabled = isBusy || !repayContext.canRepayOnChain

  const submit = useCallback(async () => {
    setError(null)

    const skipArcBalanceGate = Boolean(usdcSource?.requiresBridge)
    if (!skipArcBalanceGate) {
      const gate = contracts.canRepayReceivable(
        paymentAmount,
        repayContext.onChainReceivableId,
        repayContext.amountOwedHuman,
      )
      if (!gate.ok) {
        setError(gate.message ?? 'Cannot repay.')
        return
      }
    }
    if (!repayContext.onChainReceivableId) {
      setError(MERCHANT_REPAY_ON_CHAIN_UNAVAILABLE)
      return
    }

    const { loanId } = repayContext
    const paths = merchantRepayPaths(loanId)

    try {
      if (usdcSource?.requiresBridge) {
        if (!wallet || !address) throw new Error('Connect your wallet to repay.')
        if (!accessToken?.trim()) throw new Error('Sign in to continue.')
        setPhase('approving')
        await ensureArcUsdcForAction({
          accessToken,
          wallet,
          walletAddress: address,
          amountHuman: paymentAmount,
          purpose: 'repayment',
          selected: {
            chainId: usdcSource.chainId,
            label: usdcSource.label,
            bridgeKitId: usdcSource.bridgeKitId,
            requiresBridge: true,
            usdcAddress: usdcSource.usdcAddress,
            usdcDecimals: usdcSource.usdcDecimals,
          },
          loanRequestId: repayContext.loanId,
        })
      }

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
          usdcSource,
        },
      })
    } finally {
      setPhase('idle')
    }
  }, [
    accessToken,
    address,
    contracts,
    dispatch,
    navigate,
    queryClient,
    paymentAmount,
    receivableName,
    repayContext.amountOwedHuman,
    repayContext.loanId,
    repayContext.onChainReceivableId,
    usdcSource,
    wallet,
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
