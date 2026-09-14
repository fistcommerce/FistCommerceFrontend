import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'

import {
  canNavigateToLoanDetail,
  fetchLoanDetails,
  type LoanDetailsResponse,
} from '@/api/loanDetails'
import { displayDashboardMetricString } from '@/api/metrics'
import { getReceivableDetailById } from '@/components/dashboard/merchant/receivables/receivableDetailConfig'
import { useAppSelector } from '@/store/hooks'
import {
  demoRepayStateFromStage,
  resolveMerchantReceivableRepayState,
} from '@/utils/merchantReceivableRepayEligibility'
import {
  demoRepayReviewBreakdown,
  emptyRepayReviewBreakdown,
  mapLoanDetailsToRepayReviewBreakdown,
  parseMoneyToHuman,
  type MerchantRepayReviewBreakdown,
} from '@/utils/mapLoanDetailsToRepayReviewView'
import { normalizeReceivableIdToBytes32 } from '@/utils/receivableId'

export type { MerchantRepayReviewBreakdown } from '@/utils/mapLoanDetailsToRepayReviewView'

export type MerchantRepayLocationState = {
  receivableName?: string
  paymentAmount?: number
  txHash?: string
  /** Shown on the repay failure page when approval or repayment fails. */
  message?: string
  /** Multi-chain USDC source chosen on the amount step (CCTP / Arc). */
  usdcSource?: {
    chainId: number
    label: string
    bridgeKitId: string | null
    requiresBridge: boolean
    usdcAddress: string
    usdcDecimals: number
  }
}

export type MerchantRepayLoanContext = {
  loanId: string
  receivableName: string
  amountOwedLabel: string
  amountOwedHuman: number | null
  review: MerchantRepayReviewBreakdown
  onChainReceivableId: `0x${string}` | null
  isLoading: boolean
  isError: boolean
  isValid: boolean
  canRepay: boolean
  canRepayOnChain: boolean
}

const EMPTY_CONTEXT: MerchantRepayLoanContext = {
  loanId: '',
  receivableName: '',
  amountOwedLabel: '—',
  amountOwedHuman: null,
  review: emptyRepayReviewBreakdown(),
  onChainReceivableId: null,
  isLoading: false,
  isError: false,
  isValid: false,
  canRepay: false,
  canRepayOnChain: false,
}

function formatMoney(raw: string | null | undefined): string {
  if (!raw?.trim()) return '—'
  const formatted = displayDashboardMetricString(raw)
  return formatted === '—' ? raw.trim() : formatted
}

function displayNameFromLocation(state: MerchantRepayLocationState, loanId: string): string {
  return state.receivableName?.trim() || `Receivable ${loanId.slice(0, 8)}`
}

type RepayLoanDetailsPayload = {
  details: LoanDetailsResponse
  onChainReceivableId: `0x${string}` | null
  repayState: Awaited<ReturnType<typeof resolveMerchantReceivableRepayState>>
}

async function fetchRepayLoanDetails(
  accessToken: string,
  loanId: string,
): Promise<RepayLoanDetailsPayload> {
  const details = await fetchLoanDetails(accessToken, loanId)
  const onChainReceivableId = normalizeReceivableIdToBytes32(details.receivable.receivableId)
  const repayState = await resolveMerchantReceivableRepayState(accessToken, details)
  return { details, onChainReceivableId, repayState }
}

export function useMerchantRepayLoanContext(receivableId: string | undefined): MerchantRepayLoanContext {
  const loanId = receivableId?.trim() ?? ''
  const location = useLocation()
  const locationState = (location.state ?? {}) as MerchantRepayLocationState
  const token = useAppSelector((s) => s.auth.accessToken)?.trim() ?? ''

  const demoDetail = useMemo(
    () => (loanId ? getReceivableDetailById(loanId) : null),
    [loanId],
  )

  const fetchFromApi = Boolean(loanId && token && canNavigateToLoanDetail(loanId) && !demoDetail)

  const query = useQuery({
    queryKey: ['loan-details', 'repay', loanId, token],
    queryFn: () => fetchRepayLoanDetails(token, loanId),
    enabled: fetchFromApi,
    staleTime: 60_000,
  })

  if (!loanId || !canNavigateToLoanDetail(loanId)) {
    return EMPTY_CONTEXT
  }

  if (demoDetail) {
    const repayState = demoRepayStateFromStage(demoDetail.stage, demoDetail.row.repaymentAmount)
    const review = demoRepayReviewBreakdown(demoDetail)
    return {
      loanId,
      receivableName: demoDetail.row.receivableName,
      amountOwedLabel: review.totalOwed,
      amountOwedHuman: repayState.amountOwedHuman,
      review,
      onChainReceivableId: null,
      isLoading: false,
      isError: false,
      isValid: true,
      canRepay: repayState.canRepay,
      canRepayOnChain: false,
    }
  }

  const fallbackName = displayNameFromLocation(locationState, loanId)

  if (fetchFromApi && query.isLoading) {
    return {
      loanId,
      receivableName: fallbackName,
      amountOwedLabel: '—',
      amountOwedHuman: null,
      review: emptyRepayReviewBreakdown(),
      onChainReceivableId: null,
      isLoading: true,
      isError: false,
      isValid: true,
      canRepay: false,
      canRepayOnChain: false,
    }
  }

  if (fetchFromApi && query.data) {
    const { details: api, onChainReceivableId, repayState } = query.data
    const owedRaw = api.summary.amountOwed ?? api.summary.funding
    const review = mapLoanDetailsToRepayReviewBreakdown(api)

    return {
      loanId,
      receivableName:
        fallbackName !== `Receivable ${loanId.slice(0, 8)}`
          ? fallbackName
          : api.merchant.businessName?.trim() ||
            api.merchant.fullName?.trim() ||
            api.summary.title?.trim() ||
            fallbackName,
      amountOwedLabel: formatMoney(owedRaw),
      amountOwedHuman: repayState.amountOwedHuman ?? parseMoneyToHuman(owedRaw),
      review,
      onChainReceivableId,
      isLoading: false,
      isError: Boolean(query.isError),
      isValid: true,
      canRepay: repayState.canRepay,
      canRepayOnChain: repayState.canRepay && onChainReceivableId !== null,
    }
  }

  return {
    loanId,
    receivableName: fallbackName,
    amountOwedLabel: '—',
    amountOwedHuman: null,
    review: emptyRepayReviewBreakdown(),
    onChainReceivableId: null,
    isLoading: false,
    isError: Boolean(fetchFromApi && query.isError),
    isValid: true,
    canRepay: false,
    canRepayOnChain: false,
  }
}
