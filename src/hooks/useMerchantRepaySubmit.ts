import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

import { ensureArcUsdcForAction } from '@/bridge/ensureArcUsdc'
import {
  resolveOriginatingChainId,
  restoreWalletChainIfSafe,
} from '@/bridge/restoreWalletChain'
import { clearRepayUsdcSource } from '@/bridge/repayUsdcSourceStorage'
import { trackerPathForPurpose } from '@/bridge/transferStatus'
import { withBridgeSessionBusy } from '@/bridge/withBridgeSessionBusy'
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
import { useReconnectSessionWallet } from '@/hooks/useReconnectSessionWallet'
import { useTestnetContracts } from '@/hooks/useTestnetContracts'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { refreshMerchantReceivables } from '@/store/slices/merchantReceivablesSlice'
import { toAppUserFacingError } from '@/errors/toAppUserFacingError'
import {
  isLiveWalletDisconnectedMessage,
  waitForLiveWallet,
  type LiveWalletSnapshot,
} from '@/wallet/liveWalletForWrite'
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
  const { wallet, address, ready, isConnected } = useActiveWallet()
  const { reconnect, pending: reconnectPending } = useReconnectSessionWallet()
  const accessToken = useAppSelector((s) => s.auth?.accessToken ?? null)
  const authChainId = useAppSelector((s) => s.auth?.chainId ?? null)
  const walletChainId = useAppSelector((s) => s.wallet?.chainId)
  const liveRef = useRef<LiveWalletSnapshot>({ ready, wallet, address })
  liveRef.current = { ready, wallet, address }

  const [phase, setPhase] = useState<MerchantRepaySubmitPhase>('idle')
  const [error, setError] = useState<string | null>(null)

  const needsApproval = contracts.needsRepaymentApproval(paymentAmount)
  const isBusy = phase !== 'idle' || contracts.isWritePending || reconnectPending
  const needsReconnect = Boolean(
    !isConnected || isLiveWalletDisconnectedMessage(error),
  )
  const disabled = isBusy || !repayContext.canRepayOnChain || !ready

  const buttonLabel = reconnectPending
    ? 'Connecting wallet…'
    : !ready
      ? 'Connecting wallet…'
      : !isConnected
        ? 'Reconnect wallet'
        : merchantRepaySubmitButtonLabel(phase, needsApproval)

  const reconnectWallet = useCallback(async () => {
    setError(null)
    const result = await reconnect('repay')
    if (result.status === 'navigated' || result.status === 'connected') return
    setError(result.message)
  }, [reconnect])

  const submit = useCallback(async () => {
    setError(null)

    const live = await waitForLiveWallet(() => liveRef.current, { action: 'repay' })
    if (live.status !== 'ready') {
      await reconnectWallet()
      return
    }

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
    const originatingChainId = resolveOriginatingChainId({
      authChainId,
      walletChainId,
    })

    try {
      await withBridgeSessionBusy(async () => {
        try {
          let bridged = false
          if (usdcSource) {
            if (!accessToken?.trim()) throw new Error('Sign in to continue.')
            if (usdcSource.requiresBridge) setPhase('approving')
            const result = await ensureArcUsdcForAction({
              accessToken,
              wallet: live.wallet,
              walletAddress: live.address,
              amountHuman: paymentAmount,
              purpose: 'repayment',
              selected: {
                chainId: usdcSource.chainId,
                label: usdcSource.label,
                bridgeKitId: usdcSource.bridgeKitId,
                requiresBridge: usdcSource.requiresBridge,
                usdcAddress: usdcSource.usdcAddress,
                usdcDecimals: usdcSource.usdcDecimals,
              },
              loanRequestId: repayContext.loanId,
              metadata: { loanId: repayContext.loanId },
            })
            if (result.awaitingMint && result.transferId) {
              navigate(trackerPathForPurpose('repayment', result.transferId))
              return
            }
            bridged = result.bridged || result.skippedBridge || result.readyToContinue
          }

          const txHash = await contracts.executeMerchantRepayment(
            paymentAmount,
            repayContext.onChainReceivableId!,
            (next) => setPhase(next),
            { skipBalanceGate: bridged },
          )

          clearRepayUsdcSource(loanId)
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
        } finally {
          await restoreWalletChainIfSafe(live.wallet, originatingChainId)
        }
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
    authChainId,
    contracts,
    dispatch,
    navigate,
    queryClient,
    paymentAmount,
    receivableName,
    reconnectWallet,
    repayContext.amountOwedHuman,
    repayContext.loanId,
    repayContext.onChainReceivableId,
    usdcSource,
    walletChainId,
  ])

  return {
    submit,
    reconnect: reconnectWallet,
    phase,
    error,
    clearError: () => setError(null),
    disabled,
    needsReconnect,
    ready,
    isConnected,
    buttonLabel,
    statusMessage: merchantRepaySubmitStatusMessage(phase, needsApproval),
  }
}
