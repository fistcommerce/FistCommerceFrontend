import {
  displayDashboardCompactUsd,
  displayDashboardPercentString,
  displayPoolApyPercent,
  displayPoolUtilization,
  type InvestorMetrics,
  type PoolMetrics,
} from '@/api/metrics'
import type {
  InvestorPortfolioMetric,
  InvestorProfileStat,
  InvestorProfileTab,
} from '@/components/dashboard/investor/profile/types'
import profileTabIcon from '@/assets/Icon.png'
import walletTabIcon from '@/assets/Icon (1).png'
import historyTabIcon from '@/assets/Icon (2).png'

export const INVESTOR_PROFILE_TABS: InvestorProfileTab[] = [
  { id: 'overview', label: 'Overview', to: 'overview', icon: profileTabIcon },
  { id: 'wallets', label: 'Wallets', to: 'wallets', icon: walletTabIcon },
  { id: 'history', label: 'History', to: 'history', icon: historyTabIcon },
]

export const INVESTOR_PORTFOLIO = {
  title: 'Portfolio Summary',
  poolName: 'Fist Commerce Pool',
  poolMeta: 'Moderate risk, Moderate returns',
}

/** Coerce investor metric fields (API may send strings or JSON numbers) to a trimmed string. */
function investorMetricFieldString(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

/** `YYYY-MM-DD` or ISO datetime from API → locale date for profile line. */
export function formatProfileDobForDisplay(dateOfBirth: string | null | undefined): string {
  const s = dateOfBirth?.trim()
  if (!s) return ''
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00` : s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('en-US', { dateStyle: 'medium' })
}

/** Stats row under the hero — deposits/interest/position from metrics API (NAV-marked). */
export function buildInvestorProfileStatsFromApi(
  investorMetrics: InvestorMetrics | null,
  _onChainPoolPositionDisplay?: string | null,
): InvestorProfileStat[] {
  const totalInvested = investorMetrics
    ? displayDashboardCompactUsd(investorMetrics.total_deposited)
    : '$--'
  const totalEarnings = investorMetrics
    ? displayDashboardCompactUsd(investorMetrics.total_interest_earned)
    : '$--'
  const currentPosition = investorMetrics
    ? displayDashboardCompactUsd(investorMetrics.current_position_value)
    : '$--'

  return [
    {
      icon: 'money',
      title: 'Total invested',
      subtitle: 'Total deposited into the pool',
      primaryValue: totalInvested,
      secondaryValue: '',
    },
    {
      icon: 'dollar',
      title: 'Total Earnings',
      subtitle: 'Interest earned from investments',
      primaryValue: totalEarnings,
      secondaryValue: '',
      tone: 'positive',
    },
    {
      icon: 'money',
      title: 'Current Position',
      subtitle: 'Current position value',
      primaryValue: currentPosition,
      secondaryValue: '',
    },
  ]
}

/** Overview tab portfolio card — investor + pool metrics APIs; position is NAV from API. */
export function buildInvestorPortfolioMetricsFromApi(
  investorMetrics: InvestorMetrics | null,
  poolMetrics: PoolMetrics | null,
  _onChainPoolPositionDisplay?: string | null,
): InvestorPortfolioMetric[] {
  const shareRaw = investorMetrics ? investorMetricFieldString(investorMetrics.share_of_pool) : ''
  const shareHelper =
    shareRaw && shareRaw !== '—'
      ? `Pool share ${displayDashboardPercentString(shareRaw)}`
      : ''

  const currentPositionValue = investorMetrics
    ? displayDashboardCompactUsd(investorMetrics.current_position_value)
    : '$--'

  return [
    {
      label: 'Total Deposited',
      value: investorMetrics ? displayDashboardCompactUsd(investorMetrics.total_deposited) : '$--',
      helper: '',
    },
    {
      label: 'Current position',
      value: currentPositionValue,
      helper: shareHelper,
    },
    {
      label: 'Pool APY (est.)',
      value: poolMetrics ? displayPoolApyPercent(poolMetrics.apy) : '--%',
      helper: poolMetrics ? `Pool utilization ${displayPoolUtilization(poolMetrics.utilization)}` : '',
    },
    {
      label: 'Typical loan term',
      value: '30–90 days',
      helper: 'Program terms',
    },
  ]
}
