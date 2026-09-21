import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import UsdcBalancePicker from '@/components/bridge/UsdcBalancePicker'
import {
  buildInvestmentCompletedMetrics,
  buildInvestmentReviewRows,
  buildLiveInvestmentPoolInfo,
  formatInvestAmountUsd,
  INVESTMENT_TERMS_LABEL,
  INVESTMENT_WARNING,
  INVEST_QUICK_AMOUNTS,
} from '@/components/dashboard/investor/invest/config'
import InvestmentAmountStep from '@/components/dashboard/investor/invest/steps/InvestmentAmountStep'
import InvestmentCompletedStep from '@/components/dashboard/investor/invest/steps/InvestmentCompletedStep'
import InvestmentConfirmationStep from '@/components/dashboard/investor/invest/steps/InvestmentConfirmationStep'
import InvestmentPoolSelectionStep from '@/components/dashboard/investor/invest/steps/InvestmentPoolSelectionStep'
import { InvestmentStep } from '@/components/dashboard/investor/invest/types'
import { DashboardRequestFeedbackLayer } from '@/components/dashboard/shared/DashboardRequestFeedbackLayer'
import { ensureArcUsdcForAction } from '@/bridge/ensureArcUsdc'
import {
  resolveOriginatingChainId,
  restoreWalletChainIfSafe,
} from '@/bridge/restoreWalletChain'
import { trackerPathForPurpose } from '@/bridge/transferStatus'
import { withBridgeSessionBusy } from '@/bridge/withBridgeSessionBusy'
import { getAppChainDisplayName, isArcTestnetContractNetwork } from '@/contract_config/contractNetwork'
import { useInvestorOnChainBalances } from '@/hooks/useInvestorOnChainBalances'
import { useReconnectSessionWallet } from '@/hooks/useReconnectSessionWallet'
import { useTestnetContracts } from '@/hooks/useTestnetContracts'
import { useUsdcBalancePicker } from '@/hooks/useUsdcBalancePicker'
import { useAppSelector } from '@/store/hooks'
import { selectInvestorPoolAndMetrics } from '@/store/selectors/investorDashboardSelectors'
import { toAppUserFacingError } from '@/errors/toAppUserFacingError'
import {
  filterQuickAmountsByMax,
  validateInvestDepositAmount,
} from '@/utils/investorFlowAmountLimits'
import {
  isLiveWalletDisconnectedMessage,
  resolveLiveWalletForWrite,
  waitForLiveWallet,
  type LiveWalletSnapshot,
} from '@/wallet/liveWalletForWrite'
import { useActiveWallet } from '@/wallet/useActiveWallet'

interface InvestorInvestCardProps {
  walletDisplay?: string
  step?: InvestmentStep
  onStepChange?: (step: InvestmentStep) => void
}

type InvestFlowFailure = {
  message: string
  returnStep: InvestmentStep
  kind?: 'reconnect' | 'submit'
}

const InvestorInvestCard = ({ walletDisplay, step, onStepChange }: InvestorInvestCardProps) => {
  const { poolSlug } = useParams<{ poolSlug: string }>()
  const navigate = useNavigate()
  const [amount, setAmount] = useState(0)
  const [flowFailure, setFlowFailure] = useState<InvestFlowFailure | null>(null)
  const [investSubmitting, setInvestSubmitting] = useState(false)
  const [feedbackPhase, setFeedbackPhase] = useState<'idle' | 'loading' | 'failed'>('idle')
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [internalStep, setInternalStep] = useState<InvestmentStep>(InvestmentStep.AmountEntry)
  const currentStep = step ?? internalStep
  const displayAmount = amount
  const amountDisplay = formatInvestAmountUsd(displayAmount)
  const resolvedPoolSlug = poolSlug ?? 'fist-commerce-lending-pool'

  const {
    lendingPools: lendingPool,
    poolMetrics,
    investorMetrics,
  } = useAppSelector(selectInvestorPoolAndMetrics)

  const contracts = useTestnetContracts({
    estimateDepositHumanAmount:
      currentStep === InvestmentStep.InvestmentConfirmation ? displayAmount : undefined,
  })
  const { wallet, address, ready, isConnected } = useActiveWallet()
  const { reconnect, pending: reconnectPending } = useReconnectSessionWallet()
  const accessToken = useAppSelector((s) => s.auth?.accessToken ?? null)
  const authChainId = useAppSelector((s) => s.auth?.chainId ?? null)
  const walletChainId = useAppSelector((s) => s.wallet?.chainId)
  const { investmentBalanceDisplay, walletBalanceDisplay, walletBalanceHuman } =
    useInvestorOnChainBalances()
  const liveRef = useRef<LiveWalletSnapshot>({ ready, wallet, address })
  liveRef.current = { ready, wallet, address }

  const bridgePickerEnabled =
    isArcTestnetContractNetwork(contracts.testnetChain.id) &&
    currentStep === InvestmentStep.AmountEntry

  const {
    balances: usdcBalances,
    bridgeConfig,
    selected: selectedUsdc,
    selectedChainId,
    setSelectedChainId,
    selectedBalanceHuman,
    loading: balancesLoading,
    error: balancesError,
    circleSessionLocked,
    circleMultiAddressHint,
  } = useUsdcBalancePicker({
    purpose: 'deposit',
    amountHuman: displayAmount,
    // Keep selection + config warm through confirm (picker UI only on amount step).
    enabled:
      isArcTestnetContractNetwork(contracts.testnetChain.id) &&
      (currentStep === InvestmentStep.AmountEntry ||
        currentStep === InvestmentStep.PoolSelection ||
        currentStep === InvestmentStep.InvestmentConfirmation),
  })

  const effectiveMaxHuman =
    bridgePickerEnabled && selectedBalanceHuman != null
      ? selectedBalanceHuman
      : walletBalanceHuman

  const investQuickAmounts = useMemo(
    () => filterQuickAmountsByMax(INVEST_QUICK_AMOUNTS, effectiveMaxHuman),
    [effectiveMaxHuman],
  )

  const depositAmountError = validateInvestDepositAmount(displayAmount, effectiveMaxHuman)

  const poolInfo = useMemo(
    () => buildLiveInvestmentPoolInfo(lendingPool.poolTitle, poolMetrics),
    [lendingPool.poolTitle, poolMetrics],
  )

  const setStep = (next: InvestmentStep) => {
    onStepChange?.(next)
    if (step === undefined) setInternalStep(next)
  }

  useEffect(() => {
    if (currentStep !== InvestmentStep.FlowFailure) setFlowFailure(null)
  }, [currentStep])

  const openFlowFailure = (
    source: unknown,
    returnStep: InvestmentStep,
    kind: InvestFlowFailure['kind'] = 'submit',
  ) => {
    const message = toAppUserFacingError(source, {
      fallback: 'Something went wrong. Please try again.',
      context: 'invest',
    })
    const failureKind =
      kind === 'reconnect' || isLiveWalletDisconnectedMessage(message) ? 'reconnect' : kind
    setFlowFailure({ message, returnStep, kind: failureKind })
    setFeedbackError(message)
    setFeedbackPhase('failed')
    setStep(returnStep)
  }

  const requireLiveWallet = (returnStep: InvestmentStep): boolean => {
    const live = resolveLiveWalletForWrite(liveRef.current, 'invest')
    if (live.status === 'booting') {
      openFlowFailure(
        'Wallet is still connecting. Wait a moment and try again.',
        returnStep,
        'reconnect',
      )
      return false
    }
    if (live.status === 'disconnected') {
      openFlowFailure(live.message, returnStep, 'reconnect')
      return false
    }
    return true
  }

  const walletMockTokenLabel = useMemo(() => {
    const networkName = getAppChainDisplayName(contracts.testnetChain.id)
    if (!ready) return `Connecting wallet… (${networkName})`
    if (!contracts.isConnected) return `Connect your wallet to view token balance (${networkName}).`
    if (contracts.isContractsLoading) return 'Loading balance…'
    if (!contracts.isCorrectNetwork) {
      return `Switch to ${networkName} to deposit. Wallet balance: ${walletBalanceDisplay}.`
    }
    return `Wallet balance: ${walletBalanceDisplay}`
  }, [
    contracts.isConnected,
    contracts.isContractsLoading,
    contracts.isCorrectNetwork,
    contracts.testnetChain.id,
    ready,
    walletBalanceDisplay,
  ])

  const handlePoolContinue = () => {
    if (!requireLiveWallet(InvestmentStep.PoolSelection)) return
    const uiError = validateInvestDepositAmount(displayAmount, effectiveMaxHuman)
    if (uiError) {
      openFlowFailure(uiError, InvestmentStep.PoolSelection)
      return
    }
    if (!selectedUsdc?.requiresBridge) {
      const gate = contracts.canDepositHuman(displayAmount)
      if (!gate.ok) {
        openFlowFailure(gate.message ?? 'Cannot continue', InvestmentStep.PoolSelection)
        return
      }
    }
    setStep(InvestmentStep.InvestmentConfirmation)
  }

  const handleAmountContinue = () => {
    if (!requireLiveWallet(InvestmentStep.AmountEntry)) return
    const uiError = validateInvestDepositAmount(displayAmount, effectiveMaxHuman)
    if (uiError) {
      openFlowFailure(uiError, InvestmentStep.AmountEntry)
      return
    }
    if (selectedUsdc?.sufficient === false) {
      openFlowFailure(
        `Insufficient USDC on ${selectedUsdc.label} for this amount.`,
        InvestmentStep.AmountEntry,
      )
      return
    }
    if (!selectedUsdc?.requiresBridge) {
      const gate = contracts.canDepositHuman(displayAmount)
      if (!gate.ok) {
        openFlowFailure(gate.message ?? 'Cannot continue', InvestmentStep.AmountEntry)
        return
      }
    }
    setStep(InvestmentStep.PoolSelection)
  }

  const handleAmountSelect = (value: number) => {
    setAmount(value)
  }

  const handleReconnect = async (returnStep: InvestmentStep) => {
    setFeedbackPhase('loading')
    setFeedbackError(null)
    const result = await reconnect('invest')
    if (result.status === 'navigated') return
    if (result.status === 'connected') {
      setFeedbackPhase('idle')
      setFlowFailure(null)
      return
    }
    openFlowFailure(result.message, returnStep, 'reconnect')
  }

  const handleInvestConfirm = async () => {
    setInvestSubmitting(true)
    setFeedbackPhase('loading')
    setFeedbackError(null)
    const originatingChainId = resolveOriginatingChainId({
      authChainId,
      walletChainId,
    })
    try {
      const live = await waitForLiveWallet(() => liveRef.current, { action: 'invest' })
      if (live.status !== 'ready') {
        openFlowFailure(
          live.status === 'disconnected' ? live.message : 'Reconnect the wallet used for this session to invest.',
          InvestmentStep.InvestmentConfirmation,
          'reconnect',
        )
        return
      }
      await withBridgeSessionBusy(async () => {
        try {
          let skipBalanceGate = false
          if (isArcTestnetContractNetwork(contracts.testnetChain.id)) {
            if (!accessToken?.trim()) throw new Error('Sign in to continue.')
            if (!selectedUsdc) throw new Error('Select a USDC balance to fund this deposit.')
            const result = await ensureArcUsdcForAction({
              accessToken,
              wallet: live.wallet,
              walletAddress: live.address,
              amountHuman: displayAmount,
              purpose: 'deposit',
              selected: selectedUsdc,
              bridgeConfig,
              metadata: { poolSlug: resolvedPoolSlug },
            })
            if (result.awaitingMint && result.transferId) {
              navigate(trackerPathForPurpose('deposit', result.transferId))
              return
            }
            skipBalanceGate = result.bridged || result.skippedBridge || result.readyToContinue
          }
          await contracts.depositFundingPool(displayAmount, {
            skipBalanceGate,
          })
          setFeedbackPhase('idle')
          setStep(InvestmentStep.InvestmentCompleted)
        } finally {
          await restoreWalletChainIfSafe(live.wallet, originatingChainId)
        }
      })
    } catch (e) {
      openFlowFailure(e, InvestmentStep.InvestmentConfirmation)
    } finally {
      setInvestSubmitting(false)
    }
  }

  const needsReconnect = Boolean(
    flowFailure?.kind === 'reconnect' || isLiveWalletDisconnectedMessage(feedbackError),
  )
  const confirmBusy = investSubmitting || contracts.isWritePending || reconnectPending
  const confirmLabel = confirmBusy
    ? reconnectPending
      ? 'Connecting wallet…'
      : selectedUsdc?.requiresBridge
        ? 'Confirm burn in wallet…'
        : 'Confirm in wallet…'
    : !ready
      ? 'Connecting wallet…'
      : !isConnected
        ? 'Reconnect wallet'
        : selectedUsdc?.requiresBridge
          ? 'Start Bridge'
          : 'Invest Funds'

  const activeFeedbackPhase =
    investSubmitting || contracts.isWritePending || reconnectPending ? 'loading' : feedbackPhase

  const renderInvestmentStep = () => {
    switch (currentStep) {
      case InvestmentStep.InvestmentConfirmation:
        return (
          <InvestmentConfirmationStep
            amountDisplay={amountDisplay}
            warningText={
              selectedUsdc?.requiresBridge
                ? `This burns ${displayAmount} USDC on ${selectedUsdc.label}, then Circle mints it on Arc. After you sign, you can leave — we will notify you when the deposit is ready to complete. ${INVESTMENT_WARNING}`
                : INVESTMENT_WARNING
            }
            reviewRows={buildInvestmentReviewRows(
              displayAmount,
              poolInfo.name,
              poolMetrics,
              investorMetrics,
              {
                gasFeeEstimateDisplay: contracts.depositGasFeeLabel,
                networkDisplayName: getAppChainDisplayName(contracts.testnetChain.id),
                chainId: contracts.testnetChain.id,
              },
            )}
            isSubmitting={confirmBusy}
            submitDisabled={confirmBusy || !ready}
            submitLabel={confirmLabel}
            onInvest={() => {
              if (!ready) return
              if (!isConnected) {
                void handleReconnect(InvestmentStep.InvestmentConfirmation)
                return
              }
              void handleInvestConfirm()
            }}
          />
        )

      case InvestmentStep.InvestmentCompleted:
        return (
          <InvestmentCompletedStep
            amountDisplay={amountDisplay}
            poolName={poolInfo.name}
            metrics={buildInvestmentCompletedMetrics(displayAmount, poolMetrics, investorMetrics)}
            backToDashboardTo="/dashboard/investor/overview"
            viewPoolDetailsTo={`/dashboard/investor/lending-pool/${resolvedPoolSlug}`}
          />
        )

      case InvestmentStep.PoolSelection:
        return (
          <InvestmentPoolSelectionStep
            amountDisplay={amountDisplay}
            pool={poolInfo}
            detailsLabel={INVESTMENT_TERMS_LABEL}
            walletTokenBalanceLabel={walletMockTokenLabel}
            onContinue={handlePoolContinue}
          />
        )

      case InvestmentStep.AmountEntry:
      default:
        return (
          <InvestmentAmountStep
            amount={amount}
            walletDisplay={walletDisplay ?? '0x7A3F...92C1'}
            walletBalanceDisplay={walletBalanceDisplay}
            investmentBalanceDisplay={investmentBalanceDisplay}
            maxAmountHuman={effectiveMaxHuman}
            validationError={depositAmountError}
            quickAmounts={investQuickAmounts}
            onAmountSelect={handleAmountSelect}
            onContinue={handleAmountContinue}
            balancePicker={
              bridgePickerEnabled ? (
                <UsdcBalancePicker
                  balances={usdcBalances}
                  selectedChainId={selectedChainId}
                  onSelect={setSelectedChainId}
                  loading={balancesLoading}
                  error={balancesError}
                  amountHuman={displayAmount}
                  circleSessionLocked={circleSessionLocked}
                  circleMultiAddressHint={circleMultiAddressHint}
                />
              ) : null
            }
          />
        )
    }
  }

  return (
    <>
      <DashboardRequestFeedbackLayer
        phase={activeFeedbackPhase}
        loadingTitle={
          reconnectPending
            ? 'Connecting wallet'
            : selectedUsdc?.requiresBridge
              ? 'Starting USDC Bridge'
              : 'Submitting investment'
        }
        loadingDescription={
          reconnectPending
            ? 'Reconnect the wallet used for this session…'
            : selectedUsdc?.requiresBridge
              ? 'Confirm the burn in your wallet. After that you can leave — Circle mints on Arc in the background.'
              : 'Confirm the deposit in your wallet…'
        }
        errorTitle="Unable to complete investment"
        errorDescription={feedbackError ?? flowFailure?.message}
        retryLabel={needsReconnect ? 'Reconnect wallet' : 'Try again'}
        onDismiss={() => {
          setFeedbackPhase('idle')
          setFeedbackError(null)
          setFlowFailure(null)
        }}
        onRetry={() => {
          const returnStep = flowFailure?.returnStep
          const reconnectRetry = needsReconnect
          setFeedbackPhase('idle')
          setFeedbackError(null)
          if (reconnectRetry) {
            void handleReconnect(returnStep ?? currentStep)
            return
          }
          if (returnStep === InvestmentStep.InvestmentConfirmation) {
            void handleInvestConfirm()
            return
          }
          if (returnStep) setStep(returnStep)
        }}
      />
      {renderInvestmentStep()}
    </>
  )
}

export default InvestorInvestCard
