import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'

import MerchantRepayFlowTabs from '@/components/dashboard/merchant/repay/MerchantRepayFlowTabs'
import MerchantRepayReviewPanel from '@/components/dashboard/merchant/repay/MerchantRepayReviewPanel'
import {
  merchantRepayBreadcrumbs,
  merchantRepayPaths,
} from '@/components/dashboard/merchant/repay/repayFlowConfig'
import { DashboardRequestFeedbackLayer } from '@/components/dashboard/shared/DashboardRequestFeedbackLayer'
import { resolveRepayUsdcSource } from '@/bridge/repayUsdcSourceStorage'
import { isArcTestnetContractNetwork } from '@/contract_config/contractNetwork'
import {
  useMerchantRepayLoanContext,
  type MerchantRepayLocationState,
} from '@/hooks/useMerchantRepayLoanContext'
import { useMerchantRepaySubmit } from '@/hooks/useMerchantRepaySubmit'
import { useTestnetContracts } from '@/hooks/useTestnetContracts'
import { useWallet } from '@/hooks/useWallet'
import DashboardLayout from '@/layouts/DashboardLayout'
import { shortWalletDisplay } from '@/utils/shortWalletDisplay'

import backArrowIcon from '@/assets/ph_arrow-left.png'

const MerchantRepayLoanConfirmationPage = () => {
  const { receivableId } = useParams<{ receivableId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const repayContext = useMerchantRepayLoanContext(receivableId)
  const { shortAddress, address } = useWallet()
  const contracts = useTestnetContracts()

  const state = (location.state ?? {}) as MerchantRepayLocationState
  const paymentAmount = state.paymentAmount ?? 0
  const usdcSource = resolveRepayUsdcSource(repayContext.loanId || receivableId || '', state.usdcSource)
  const arcMode = isArcTestnetContractNetwork(contracts.testnetChain.id)

  const submit = useMerchantRepaySubmit({
    repayContext,
    paymentAmount,
    receivableName: state.receivableName ?? repayContext.receivableName,
    usdcSource: usdcSource ?? undefined,
  })

  const submitBusy = submit.phase !== 'idle'

  if (!repayContext.isValid) {
    return <Navigate to="/dashboard/merchant/receivables" replace />
  }

  const { loanId } = repayContext
  const paths = merchantRepayPaths(loanId)
  const breadcrumbs = merchantRepayBreadcrumbs(loanId)

  if (!repayContext.isLoading && !repayContext.canRepay) {
    return <Navigate to={paths.detail} replace />
  }

  if (!repayContext.isLoading && paymentAmount <= 0) {
    return (
      <Navigate
        to={paths.amount}
        replace
        state={{ receivableName: repayContext.receivableName }}
      />
    )
  }

  // Arc CCTP mode requires a known USDC source (location state or sessionStorage).
  if (!repayContext.isLoading && arcMode && !usdcSource) {
    return (
      <Navigate
        to={paths.amount}
        replace
        state={{
          receivableName: state.receivableName ?? repayContext.receivableName,
          paymentAmount,
        }}
      />
    )
  }

  if (repayContext.isLoading) {
    return (
      <DashboardLayout dashboardBasePath="/dashboard/merchant" topBarBreadcrumbs={breadcrumbs}>
        <DashboardRequestFeedbackLayer
          phase="loading"
          loadingTitle="Loading repayment details"
          loadingDescription="Fetching loan balance and repayment information…"
          errorTitle="Unable to load repayment details"
          onDismiss={() => {}}
        />
      </DashboardLayout>
    )
  }

  const paymentDisplay = paymentAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })
  const navState: MerchantRepayLocationState = {
    ...state,
    usdcSource: usdcSource ?? undefined,
  }

  return (
    <DashboardLayout dashboardBasePath="/dashboard/merchant" topBarBreadcrumbs={breadcrumbs}>
      <DashboardRequestFeedbackLayer
        phase={submitBusy ? 'loading' : submit.error ? 'failed' : 'idle'}
        loadingTitle="Submitting repayment"
        loadingDescription={
          submit.statusMessage ||
          (usdcSource?.requiresBridge
            ? 'Confirm the burn in your wallet. After that you can leave — Circle mints on Arc in the background.'
            : 'Processing your repayment…')
        }
        errorTitle="Unable to submit repayment"
        errorDescription={submit.error ?? undefined}
        retryLabel={submit.needsReconnect ? 'Reconnect wallet' : 'Try again'}
        onDismiss={() => submit.clearError()}
        onRetry={() => {
          if (submit.needsReconnect) {
            void submit.reconnect()
            return
          }
          void submit.submit()
        }}
      />
      <div className="max-w-[860px] w-full mx-auto pt-8 pb-6 flex flex-col gap-6">
        <button
          type="button"
          onClick={() => navigate(paths.amount, { state: navState })}
          className="inline-flex items-center gap-2 text-[#6B7488] text-[16px] leading-[20px] hover:underline w-fit"
        >
          <img src={backArrowIcon} alt="" className="h-[20px] w-[20px] object-contain" />
          <span>Back</span>
        </button>

        <div>
          <h1 className="text-[#0B1220] font-bold text-[20px] leading-tight">Review Repayment</h1>
          <p className="text-[#6B7488] text-[12px] mt-1">Review your details before proceeding.</p>
        </div>

        <MerchantRepayFlowTabs
          activeStep={1}
          onStepSelect={(step) => {
            if (step === 0) navigate(paths.amount, { state: navState })
          }}
        />

        <MerchantRepayReviewPanel
          receivableName={repayContext.receivableName}
          paymentDisplay={paymentDisplay}
          review={repayContext.review}
          connectedWallet={shortWalletDisplay(shortAddress ?? address)}
          canRepayOnChain={repayContext.canRepayOnChain}
          statusMessage={submit.statusMessage}
          submitError={submit.error}
          buttonLabel={submit.buttonLabel}
          submitDisabled={submit.disabled}
          onSubmit={() => {
            if (submit.needsReconnect) {
              void submit.reconnect()
              return
            }
            void submit.submit()
          }}
        />
      </div>
    </DashboardLayout>
  )
}

export default MerchantRepayLoanConfirmationPage
