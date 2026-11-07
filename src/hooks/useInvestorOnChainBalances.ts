import { useMemo } from 'react'

import { displayDashboardMetricString } from '@/api/metrics'
import { useIsStellarTestnetMode } from '@/hooks/usePreferredAppNetwork'
import { useStellarBalances } from '@/hooks/useStellarBalances'
import { useTestnetContracts } from '@/hooks/useTestnetContracts'

/** On-chain pool position + wallet token balance for investor financial flows. */
export function useInvestorOnChainBalances() {
  const stellarMode = useIsStellarTestnetMode()
  const stellar = useStellarBalances()
  const contracts = useTestnetContracts()

  const investmentBalanceDisplay = useMemo(() => {
    if (stellarMode) return stellar.investmentBalanceDisplay
    if (!contracts.isConnected) return '—'
    if (contracts.poolPositionLoading) return '—'
    return contracts.poolPositionUsdDisplay
  }, [
    stellarMode,
    stellar.investmentBalanceDisplay,
    contracts.isConnected,
    contracts.poolPositionLoading,
    contracts.poolPositionUsdDisplay,
  ])

  const walletBalanceDisplay = useMemo(() => {
    if (stellarMode) return stellar.walletBalanceDisplay
    if (!contracts.isConnected) return '—'
    if (contracts.isContractsLoading) return '—'
    const formatted = contracts.mockTokenBalanceFormatted
    if (formatted === '—') return '—'
    return displayDashboardMetricString(formatted)
  }, [
    stellarMode,
    stellar.walletBalanceDisplay,
    contracts.isConnected,
    contracts.isContractsLoading,
    contracts.mockTokenBalanceFormatted,
  ])

  const investmentBalanceHuman = stellarMode
    ? stellar.investmentBalanceHuman
    : contracts.poolPositionHuman

  const walletBalanceHuman = useMemo(() => {
    if (stellarMode) return stellar.walletBalanceHuman
    const formatted = contracts.mockTokenBalanceFormatted
    if (formatted === '—') return null
    const n = Number(formatted.replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }, [stellarMode, stellar.walletBalanceHuman, contracts.mockTokenBalanceFormatted])

  return {
    contracts,
    stellar,
    investmentBalanceDisplay,
    walletBalanceDisplay,
    investmentBalanceHuman,
    walletBalanceHuman,
    walletTokenBalanceFormatted: stellarMode
      ? (stellar.walletBalanceHuman != null ? String(stellar.walletBalanceHuman) : '—')
      : contracts.mockTokenBalanceFormatted,
    poolPositionLoading: stellarMode ? stellar.loading : contracts.poolPositionLoading,
  }
}
