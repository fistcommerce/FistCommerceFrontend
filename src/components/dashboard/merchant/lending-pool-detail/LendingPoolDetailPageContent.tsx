import {
  displayDashboardCompactUsd,
  formatDashboardCompactUsd,
  formatDashboardPercentMetric,
  type PoolMetrics,
} from '@/api/metrics'
import { fetchRiskTiers, type RiskTier } from '@/api/riskTiers'
import LendingPoolDetailHeroBanner from '@/components/dashboard/merchant/lending-pool-detail/LendingPoolDetailHeroBanner'
import LendingPoolDetailOverview from '@/components/dashboard/merchant/lending-pool-detail/LendingPoolDetailOverview'
import MerchantLoansTable from '@/components/dashboard/merchant/lending-pool-detail/MerchantLoansTable'
import type { LendingPoolDetailConfig } from '@/components/dashboard/merchant/lending-pool-detail/types'
import type { RecentTx } from '@/components/dashboard/investor/lending-pool-detail/types'
import { RecentTransactionsSection } from '@/components/dashboard/shared/RecentTransactionsSection'
import { useAppSelector } from '@/store/hooks'
import { selectMerchantPoolMetrics } from '@/store/selectors/merchantDashboardSelectors'
import {
  selectMerchantLoanTableRows,
  selectMerchantReceivablesError,
  selectMerchantReceivablesStatus,
} from '@/store/selectors/merchantReceivablesSelectors'
import {
  formatActiveRiskTierDurationBand,
  formatActiveRiskTierInterestBand,
} from '@/utils/riskTierDisplay'
import type { ListPaginationMeta } from '@/utils/listPagination'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

interface LendingPoolDetailPageContentProps {
  config: LendingPoolDetailConfig
  onApplyToBorrow?: () => void
  recentTransactions: RecentTx[]
  recentTransactionsPaginationMeta: ListPaginationMeta
  onRecentTransactionsPageChange: (page: number) => void
  recentTransactionsLoading?: boolean
  recentTransactionsExplorerHref?: string | null
}

function fmtUsd(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return formatDashboardCompactUsd(v)
  if (typeof v === 'string' && v.trim()) return displayDashboardCompactUsd(v.trim())
  return null
}

type PoolMetricRowResolver = Record<string, (m: PoolMetrics) => string | null>

const HERO_STATS_FROM_POOL_METRICS: PoolMetricRowResolver = {
  'Total Deposited': (m) => fmtUsd(m.tvl),
  'Liquid Asset': (m) => fmtUsd(m.liquidAssets),
  // Practical borrowable amount from the pool (no separate on-chain facility cap).
  'Maximum loan': (m) => fmtUsd(m.liquidAssets),
}

const FINANCIAL_INFO_FROM_POOL_METRICS: PoolMetricRowResolver = {
  'Available Liquidity': (m) => fmtUsd(m.availableLiquidity),
  'Total Pool Size': (m) => fmtUsd(m.tvl),
  // Intentionally left as realized pool APY — do not replace with risk-tier band.
  'Average APY to Investors': (m) =>
    Number.isFinite(m.apy) ? `${formatDashboardPercentMetric(m.apy)} APY` : null,
  'Utilization Rate': (m) =>
    Number.isFinite(m.utilization) ? formatDashboardPercentMetric(m.utilization) : null,
}

function mergeRowsFromPoolMetrics<Row extends { label: string; value: string }>(
  rows: Row[],
  metrics: PoolMetrics | null,
  resolvers: PoolMetricRowResolver,
): Row[] {
  return rows.map((row) => {
    const resolver = resolvers[row.label]
    if (!resolver) return row
    if (!metrics) return { ...row, value: '—' }
    const next = resolver(metrics)
    return { ...row, value: next ?? '—' }
  })
}

function mergeRowsFromRiskTiers<Row extends { label: string; value: string }>(
  rows: Row[],
  tiers: RiskTier[] | null,
  resolvers: Record<string, (t: RiskTier[]) => string | null>,
): Row[] {
  return rows.map((row) => {
    const resolver = resolvers[row.label]
    if (!resolver) return row
    if (!tiers) return row
    const next = resolver(tiers)
    return next ? { ...row, value: next } : row
  })
}

const HERO_STATS_FROM_RISK_TIERS: Record<string, (t: RiskTier[]) => string | null> = {
  'Loan Interest': (t) => formatActiveRiskTierInterestBand(t),
  'Target Repayment Duration': (t) => formatActiveRiskTierDurationBand(t),
}

const TERMS_FROM_RISK_TIERS: Record<string, (t: RiskTier[]) => string | null> = {
  'Borrow APR': (t) => {
    const band = formatActiveRiskTierInterestBand(t)
    return band ? `${band} APR` : null
  },
  'Loan Duration': (t) => formatActiveRiskTierDurationBand(t),
}

const LendingPoolDetailPageContent = ({
  config,
  onApplyToBorrow,
  recentTransactions,
  recentTransactionsPaginationMeta,
  onRecentTransactionsPageChange,
  recentTransactionsLoading = false,
  recentTransactionsExplorerHref = null,
}: LendingPoolDetailPageContentProps) => {
  const navigate = useNavigate()
  const poolMetrics = useAppSelector(selectMerchantPoolMetrics)
  const sessionChainId = useAppSelector((s) => s.auth.chainId)
  const loans = useAppSelector(selectMerchantLoanTableRows)
  const status = useAppSelector(selectMerchantReceivablesStatus)
  const error = useAppSelector(selectMerchantReceivablesError)

  const { data: riskTiers = null } = useQuery({
    queryKey: ['loan-risk-tiers', sessionChainId],
    queryFn: () => fetchRiskTiers(sessionChainId),
    staleTime: 60_000,
  })

  const stats = useMemo(() => {
    const fromPool = mergeRowsFromPoolMetrics(config.stats, poolMetrics, HERO_STATS_FROM_POOL_METRICS)
    return mergeRowsFromRiskTiers(fromPool, riskTiers, HERO_STATS_FROM_RISK_TIERS)
  }, [config.stats, poolMetrics, riskTiers])

  const financialInfoRows = useMemo(
    () => mergeRowsFromPoolMetrics(config.financialInfoRows, poolMetrics, FINANCIAL_INFO_FROM_POOL_METRICS),
    [config.financialInfoRows, poolMetrics],
  )

  const termsForLoanRows = useMemo(
    () => mergeRowsFromRiskTiers(config.termsForLoanRows, riskTiers, TERMS_FROM_RISK_TIERS),
    [config.termsForLoanRows, riskTiers],
  )

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-[#6B7488] text-[13px] inline-flex items-center gap-2 hover:text-[#195EBC]"
        >
          <span aria-hidden>←</span>
          Back
        </button>
      </div>
      <LendingPoolDetailHeroBanner
        title={config.title}
        subtitle={config.subtitle}
        stats={stats}
        onApplyToBorrow={onApplyToBorrow}
      />
      <LendingPoolDetailOverview
        overviewParagraphs={config.overviewParagraphs}
        financialInfoRows={financialInfoRows}
        termsForLoanRows={termsForLoanRows}
      />
      <MerchantLoansTable loans={loans} status={status} error={error} />
      <RecentTransactionsSection
        transactions={recentTransactions}
        paginationMeta={recentTransactionsPaginationMeta}
        onPageChange={onRecentTransactionsPageChange}
        loading={recentTransactionsLoading}
        contractExplorerHref={recentTransactionsExplorerHref}
      />
    </div>
  )
}

export default LendingPoolDetailPageContent
