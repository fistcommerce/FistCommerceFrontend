import { useMemo, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'

import UsdcBalancePicker from '@/components/bridge/UsdcBalancePicker'
import MerchantRepayAmountStep from '@/components/dashboard/merchant/repay/MerchantRepayAmountStep'
import MerchantRepayFlowTabs from '@/components/dashboard/merchant/repay/MerchantRepayFlowTabs'
import {
  MERCHANT_REPAY_ON_CHAIN_UNAVAILABLE,
  MERCHANT_REPAY_QUICK_AMOUNTS,
  merchantRepayBreadcrumbs,
  merchantRepayPaths,
} from '@/components/dashboard/merchant/repay/repayFlowConfig'
import { DashboardRequestFeedbackLayer } from '@/components/dashboard/shared/DashboardRequestFeedbackLayer'
import { saveRepayUsdcSource } from '@/bridge/repayUsdcSourceStorage'
import { isArcTestnetContractNetwork } from '@/contract_config/contractNetwork'
import {
  useMerchantRepayLoanContext,
  type MerchantRepayLocationState,
} from '@/hooks/useMerchantRepayLoanContext'
import { useReconnectSessionWallet } from '@/hooks/useReconnectSessionWallet'
import { useTestnetContracts } from '@/hooks/useTestnetContracts'
import { useTokenBalanceLabel } from '@/hooks/useTokenBalanceLabel'
import { useUsdcBalancePicker } from '@/hooks/useUsdcBalancePicker'
import { useWallet } from '@/hooks/useWallet'
import DashboardLayout from '@/layouts/DashboardLayout'
import { resolveLiveWalletForWrite } from '@/wallet/liveWalletForWrite'
import { useActiveWallet } from '@/wallet/useActiveWallet'
import {
  clampMerchantRepayAmount,
  validateMerchantRepayAmount,
} from '@/utils/merchantReceivableRepayEligibility'
import { shortWalletDisplay } from '@/utils/shortWalletDisplay'

const MerchantRepayLoanPage = () => {
  const { receivableId } = useParams<{ receivableId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const repayContext = useMerchantRepayLoanContext(receivableId)
  const locationState = (location.state ?? {}) as MerchantRepayLocationState
  const { shortAddress, address } = useWallet()
  const { ready, wallet, address: liveAddress } = useActiveWallet()
  const { reconnect } = useReconnectSessionWallet()
  const contracts = useTestnetContracts()
  const walletTokenBalanceLabel = useTokenBalanceLabel('repay')

  const [amount, setAmount] = useState(0)
  const [validationError, setValidationError] = useState<string | null>(null)

  const bridgePickerEnabled = isArcTestnetContractNetwork(contracts.testnetChain.id)
  const {
    balances: usdcBalances,
    selected: selectedUsdc,
    selectedChainId,
    setSelectedChainId,
    loading: balancesLoading,
    error: balancesError,
    circleSessionLocked,
    circleMultiAddressHint,
  } = useUsdcBalancePicker({
    purpose: 'repayment',
    amountHuman: amount,
    enabled: bridgePickerEnabled,
  })

  const quickAmounts = useMemo(() => {
    const max = repayContext.amountOwedHuman
    return MERCHANT_REPAY_QUICK_AMOUNTS.filter((v) => max == null || v <= max)
  }, [repayContext.amountOwedHuman])

  const amountValidationError = validateMerchantRepayAmount(amount, repayContext.amountOwedHuman)
  const displayValidationError = validationError ?? amountValidationError

  if (!repayContext.isValid) {
    return <Navigate to="/dashboard/merchant/receivables" replace />
  }

  const { loanId } = repayContext
  const paths = merchantRepayPaths(loanId)
  const breadcrumbs = merchantRepayBreadcrumbs(loanId)

  if (!repayContext.isLoading && !repayContext.canRepay) {
    return <Navigate to={paths.detail} replace />
  }

  const handleContinue = () => {
    const live = resolveLiveWalletForWrite({ ready, wallet, address: liveAddress }, 'repay')
    if (live.status === 'booting') {
      setValidationError('Wallet is still connecting. Wait a moment and try again.')
      return
    }
    if (live.status === 'disconnected') {
      setValidationError(live.message)
      void reconnect('repay')
      return
    }
    const owedError = validateMerchantRepayAmount(amount, repayContext.amountOwedHuman)
    if (owedError) {
      setValidationError(owedError)
      return
    }
    if (bridgePickerEnabled && !selectedUsdc) {
      setValidationError('Select a USDC balance to fund this repayment.')
      return
    }
    if (selectedUsdc?.sufficient === false) {
      setValidationError(`Insufficient USDC on ${selectedUsdc.label} for this amount.`)
      return
    }
    if (!selectedUsdc?.requiresBridge) {
      const gate = contracts.canRepayReceivable(
        amount,
        repayContext.onChainReceivableId,
        repayContext.amountOwedHuman,
      )
      if (!gate.ok) {
        setValidationError(gate.message ?? 'Cannot continue.')
        return
      }
    }
    if (!repayContext.canRepayOnChain) {
      setValidationError(MERCHANT_REPAY_ON_CHAIN_UNAVAILABLE)
      return
    }
    setValidationError(null)
    const usdcSource = selectedUsdc
      ? {
          chainId: selectedUsdc.chainId,
          label: selectedUsdc.label,
          bridgeKitId: selectedUsdc.bridgeKitId,
          requiresBridge: selectedUsdc.requiresBridge,
          usdcAddress: selectedUsdc.usdcAddress,
          usdcDecimals: selectedUsdc.usdcDecimals,
        }
      : undefined
    if (usdcSource) saveRepayUsdcSource(loanId, usdcSource)
    navigate(paths.confirm, {
      state: {
        ...locationState,
        receivableName: repayContext.receivableName,
        paymentAmount: amount,
        usdcSource,
      } satisfies MerchantRepayLocationState,
    })
  }

  return (
    <DashboardLayout dashboardBasePath="/dashboard/merchant" topBarBreadcrumbs={breadcrumbs}>
      <DashboardRequestFeedbackLayer
        phase={repayContext.isLoading ? 'loading' : 'idle'}
        loadingTitle="Loading repayment details"
        loadingDescription="Fetching loan balance and repayment information…"
        errorTitle="Unable to load repayment details"
        onDismiss={() => {}}
        onCancelLoading={() => {}}
      />
      <div className="max-w-[820px] w-full mx-auto pt-8 pb-6 flex flex-col gap-6">
        <div>
          <h1 className="text-[#0B1220] font-bold text-[28px] leading-tight">Repay Loan</h1>
          <p className="text-[#6B7488] text-[16px] mt-1.5">
            Make a repayment toward your outstanding loan balance for{' '}
            <span className="font-medium text-[#0B1220]">{repayContext.receivableName}</span>.
          </p>
        </div>

        <MerchantRepayFlowTabs activeStep={0} />

        <MerchantRepayAmountStep
          amount={amount}
          destinationWallet={shortWalletDisplay(shortAddress ?? address)}
          amountOwedLabel={repayContext.amountOwedLabel}
          amountOwedHuman={repayContext.amountOwedHuman}
          walletTokenBalanceLabel={walletTokenBalanceLabel}
          validationError={displayValidationError}
          quickAmounts={quickAmounts}
          onAmountSelect={(v) => {
            const clamped = clampMerchantRepayAmount(v, repayContext.amountOwedHuman)
            setAmount(clamped)
            setValidationError(validateMerchantRepayAmount(clamped, repayContext.amountOwedHuman))
          }}
          onContinue={handleContinue}
          balancePicker={
            bridgePickerEnabled ? (
              <UsdcBalancePicker
                balances={usdcBalances}
                selectedChainId={selectedChainId}
                onSelect={setSelectedChainId}
                loading={balancesLoading}
                error={balancesError}
                amountHuman={amount}
                circleSessionLocked={circleSessionLocked}
                circleMultiAddressHint={circleMultiAddressHint}
              />
            ) : null
          }
        />
      </div>
    </DashboardLayout>
  )
}

export default MerchantRepayLoanPage
