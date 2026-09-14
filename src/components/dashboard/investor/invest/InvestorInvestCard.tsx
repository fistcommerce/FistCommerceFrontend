import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

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
import { getAppChainDisplayName, isArcTestnetContractNetwork } from '@/contract_config/contractNetwork'
import { useInvestorOnChainBalances } from '@/hooks/useInvestorOnChainBalances'
import { useTestnetContracts } from '@/hooks/useTestnetContracts'
import { useUsdcBalancePicker } from '@/hooks/useUsdcBalancePicker'
import { useAppSelector } from '@/store/hooks'
import { selectInvestorPoolAndMetrics } from '@/store/selectors/investorDashboardSelectors'
import { toAppUserFacingError } from '@/errors/toAppUserFacingError'
import {
  filterQuickAmountsByMax,
  validateInvestDepositAmount,
} from '@/utils/investorFlowAmountLimits'
import { useActiveWallet } from '@/wallet/useActiveWallet'

interface InvestorInvestCardProps {
  walletDisplay?: string
  step?: InvestmentStep
  onStepChange?: (step: InvestmentStep) => void
}

type InvestFlowFailure = {
  message: string
  returnStep: InvestmentStep
}

const InvestorInvestCard = ({ walletDisplay, step, onStepChange }: InvestorInvestCardProps) => {
  const { poolSlug } = useParams<{ poolSlug: string }>()
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
  const { wallet, address } = useActiveWallet()
  const accessToken = useAppSelector((s) => s.auth?.accessToken ?? null)
  const { investmentBalanceDisplay, walletBalanceDisplay, walletBalanceHuman } = useInvestorOnChainBalances()

  const bridgePickerEnabled =
    isArcTestnetContractNetwork(contracts.testnetChain.id) &&
    currentStep === InvestmentStep.AmountEntry

  const {
    balances: usdcBalances,
    selected: selectedUsdc,
    selectedChainId,
    setSelectedChainId,
    selectedBalanceHuman,
    loading: balancesLoading,
    error: balancesError,
  } = useUsdcBalancePicker({
    purpose: 'deposit',
    amountHuman: displayAmount,
    enabled: bridgePickerEnabled,
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

  const openFlowFailure = (source: unknown, returnStep: InvestmentStep) => {
    const message = toAppUserFacingError(source, {
      fallback: 'Something went wrong. Please try again.',
      context: 'invest',
    })
    setFlowFailure({ message, returnStep })
    setFeedbackError(message)
    setFeedbackPhase('failed')
    setStep(returnStep)
  }

  const walletMockTokenLabel = useMemo(() => {
    const networkName = getAppChainDisplayName(contracts.testnetChain.id)
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
    walletBalanceDisplay,
  ])

  const handlePoolContinue = () => {
    const uiError = validateInvestDepositAmount(displayAmount, effectiveMaxHuman)
    if (uiError) {
      openFlowFailure(uiError, InvestmentStep.PoolSelection)
      return
    }
    // When funding from a CCTP source, Arc balance may be low until bridge completes at confirm.
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

  const handleInvestConfirm = async () => {
    setInvestSubmitting(true)
    setFeedbackPhase('loading')
    setFeedbackError(null)
    try {
      if (!wallet || !address) throw new Error('Connect your wallet to invest.')
      if (isArcTestnetContractNetwork(contracts.testnetChain.id)) {
        if (!accessToken?.trim()) throw new Error('Sign in to continue.')
        if (!selectedUsdc) throw new Error('Select a USDC balance to fund this deposit.')
        await ensureArcUsdcForAction({
          accessToken,
          wallet,
          walletAddress: address,
          amountHuman: displayAmount,
          purpose: 'deposit',
          selected: selectedUsdc,
        })
      }
      await contracts.depositFundingPool(displayAmount)
      setFeedbackPhase('idle')
      setStep(InvestmentStep.InvestmentCompleted)
    } catch (e) {
      openFlowFailure(e, InvestmentStep.InvestmentConfirmation)
    } finally {
      setInvestSubmitting(false)
    }
  }

  const activeFeedbackPhase =
    investSubmitting || contracts.isWritePending
      ? 'loading'
      : feedbackPhase

  const renderInvestmentStep = () => {
    switch (currentStep) {
      case InvestmentStep.InvestmentConfirmation:
        return (
          <InvestmentConfirmationStep
            amountDisplay={amountDisplay}
            warningText={INVESTMENT_WARNING}
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
            isSubmitting={investSubmitting || contracts.isWritePending}
            onInvest={handleInvestConfirm}
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
        loadingTitle="Submitting investment"
        loadingDescription="If needed we bridge USDC to Arc, then confirm the deposit in your wallet…"
        errorTitle="Unable to complete investment"
        errorDescription={feedbackError ?? flowFailure?.message}
        onDismiss={() => {
          setFeedbackPhase('idle')
          setFeedbackError(null)
          setFlowFailure(null)
        }}
        onRetry={() => {
          setFeedbackPhase('idle')
          setFeedbackError(null)
          if (flowFailure?.returnStep === InvestmentStep.InvestmentConfirmation) {
            void handleInvestConfirm()
            return
          }
          if (flowFailure?.returnStep) setStep(flowFailure.returnStep)
        }}
      />
      {renderInvestmentStep()}
    </>
  )
}

export default InvestorInvestCard
