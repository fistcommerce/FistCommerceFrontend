import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

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
import { getAppChainDisplayName } from '@/contract_config/contractNetwork'
import { useInvestorOnChainBalances } from '@/hooks/useInvestorOnChainBalances'
import { useIsStellarTestnetMode } from '@/hooks/usePreferredAppNetwork'
import { useTestnetContracts } from '@/hooks/useTestnetContracts'
import { useWallet } from '@/hooks/useWallet'
import { STELLAR_TESTNET_LABEL } from '@/stellar/chain'
import { depositToTradeCreditPool } from '@/stellar/poolWrites'
import { useAppSelector } from '@/store/hooks'
import { selectInvestorPoolAndMetrics } from '@/store/selectors/investorDashboardSelectors'
import { toAppUserFacingError } from '@/errors/toAppUserFacingError'
import {
  filterQuickAmountsByMax,
  validateInvestDepositAmount,
} from '@/utils/investorFlowAmountLimits'

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

  const stellarMode = useIsStellarTestnetMode()
  const { address: stellarAddress } = useWallet()
  const contracts = useTestnetContracts({
    estimateDepositHumanAmount:
      !stellarMode && currentStep === InvestmentStep.InvestmentConfirmation
        ? displayAmount
        : undefined,
  })
  const {
    investmentBalanceDisplay,
    walletBalanceDisplay,
    walletBalanceHuman,
    stellar,
  } = useInvestorOnChainBalances()

  const investQuickAmounts = useMemo(
    () => filterQuickAmountsByMax(INVEST_QUICK_AMOUNTS, walletBalanceHuman),
    [walletBalanceHuman],
  )

  const depositAmountError = validateInvestDepositAmount(displayAmount, walletBalanceHuman)

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
    if (stellarMode) {
      if (stellar.loading) return 'Loading FISTUSD balance…'
      return `Wallet balance: ${walletBalanceDisplay} (${STELLAR_TESTNET_LABEL})`
    }
    const networkName = getAppChainDisplayName(contracts.testnetChain.id)
    if (!contracts.isConnected) return `Connect your wallet to view token balance (${networkName}).`
    if (contracts.isContractsLoading) return 'Loading balance…'
    if (!contracts.isCorrectNetwork) {
      return `Switch to ${networkName} to deposit. Wallet balance: ${walletBalanceDisplay}.`
    }
    return `Wallet balance: ${walletBalanceDisplay}`
  }, [
    stellarMode,
    stellar.loading,
    contracts.isConnected,
    contracts.isContractsLoading,
    contracts.isCorrectNetwork,
    contracts.testnetChain.id,
    walletBalanceDisplay,
  ])

  const handlePoolContinue = () => {
    const uiError = validateInvestDepositAmount(displayAmount, walletBalanceHuman)
    if (uiError) {
      openFlowFailure(uiError, InvestmentStep.PoolSelection)
      return
    }
    if (!stellarMode) {
      const gate = contracts.canDepositHuman(displayAmount)
      if (!gate.ok) {
        openFlowFailure(gate.message ?? 'Cannot continue', InvestmentStep.PoolSelection)
        return
      }
    }
    setStep(InvestmentStep.InvestmentConfirmation)
  }

  const handleAmountContinue = () => {
    const uiError = validateInvestDepositAmount(displayAmount, walletBalanceHuman)
    if (uiError) {
      openFlowFailure(uiError, InvestmentStep.AmountEntry)
      return
    }
    if (!stellarMode) {
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
      if (stellarMode) {
        if (!stellarAddress) throw new Error('Connect your Stellar wallet to deposit.')
        await depositToTradeCreditPool({
          investor: stellarAddress,
          amountHuman: displayAmount,
        })
        stellar.refresh()
      } else {
        await contracts.depositFundingPool(displayAmount)
      }
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
                gasFeeEstimateDisplay: stellarMode ? 'Soroban fees' : contracts.depositGasFeeLabel,
                networkDisplayName: stellarMode
                  ? STELLAR_TESTNET_LABEL
                  : getAppChainDisplayName(contracts.testnetChain.id),
                chainId: stellarMode ? 1_397_037_394 : contracts.testnetChain.id,
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
            maxAmountHuman={walletBalanceHuman}
            validationError={depositAmountError}
            quickAmounts={investQuickAmounts}
            onAmountSelect={handleAmountSelect}
            onContinue={handleAmountContinue}
          />
        )
    }
  }

  return (
    <>
      <DashboardRequestFeedbackLayer
        phase={activeFeedbackPhase}
        loadingTitle="Submitting investment"
        loadingDescription="Confirm the deposit in your wallet…"
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
