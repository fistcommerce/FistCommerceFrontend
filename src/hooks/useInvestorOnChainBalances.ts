import { useMemo } from 'react'

import { displayDashboardMetricString } from '@/api/metrics'
import { useTestnetContracts } from '@/hooks/useTestnetContracts'
import {
  formatInvestorInvestmentBalanceDisplay,
  formatInvestorWalletBalanceDisplay,
} from '@/wallet/investorBalanceDisplay'

/** On-chain pool position + wallet token balance for investor financial flows. */
export function useInvestorOnChainBalances() {
  const contracts = useTestnetContracts()

  const investmentBalanceDisplay = useMemo(
    () =>
      formatInvestorInvestmentBalanceDisplay({
        readAddress: contracts.readAddress,
        isLoading: contracts.poolPositionLoading,
        positionDisplay: contracts.poolPositionUsdDisplay,
      }),
    [contracts.readAddress, contracts.poolPositionLoading, contracts.poolPositionUsdDisplay],
  )

  const walletBalanceDisplay = useMemo(
    () =>
      formatInvestorWalletBalanceDisplay({
        readAddress: contracts.readAddress,
        isLoading: contracts.isContractsLoading,
        formattedBalance: contracts.mockTokenBalanceFormatted,
        formatMetric: displayDashboardMetricString,
      }),
    [
      contracts.readAddress,
      contracts.isContractsLoading,
      contracts.mockTokenBalanceFormatted,
    ],
  )

  const investmentBalanceHuman = contracts.poolPositionHuman

  const walletBalanceHuman = useMemo(() => {
    const formatted = contracts.mockTokenBalanceFormatted
    if (formatted === '—' || !contracts.readAddress) return null
    const n = Number(formatted.replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }, [contracts.mockTokenBalanceFormatted, contracts.readAddress])

  return {
    contracts,
    investmentBalanceDisplay,
    walletBalanceDisplay,
    investmentBalanceHuman,
    walletBalanceHuman,
    walletTokenBalanceFormatted: contracts.mockTokenBalanceFormatted,
    poolPositionLoading: contracts.poolPositionLoading,
  }
}
