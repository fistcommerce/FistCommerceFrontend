import { useMemo } from 'react'

import { getAppChainDisplayName } from '@/contract_config/contractNetwork'
import { useIsStellarTestnetMode } from '@/hooks/usePreferredAppNetwork'
import { useStellarBalances } from '@/hooks/useStellarBalances'
import { useTestnetContracts } from '@/hooks/useTestnetContracts'
import { useWallet } from '@/hooks/useWallet'
import { STELLAR_TESTNET_LABEL } from '@/stellar/chain'

/** Human-readable token balance line for financial flows (invest, repay, etc.). */
export function useTokenBalanceLabel(actionWhenOffChain: string) {
  const stellarMode = useIsStellarTestnetMode()
  const { isConnected: stellarConnected } = useWallet()
  const stellar = useStellarBalances()
  const contracts = useTestnetContracts()

  return useMemo(() => {
    if (stellarMode) {
      if (!stellarConnected) return 'Connect your Stellar wallet to view your FISTUSD balance.'
      if (stellar.loading) return 'Loading FISTUSD balance…'
      return `Wallet balance: ${stellar.walletBalanceDisplay} (${STELLAR_TESTNET_LABEL})`
    }
    if (!contracts.isConnected) return 'Connect your wallet to view your token balance.'
    if (contracts.isContractsLoading) return 'Loading balance…'
    const formatted = contracts.mockTokenBalanceFormatted
    const amountLine = formatted === '—' ? 'Wallet balance: —' : `Wallet balance: ${formatted}`
    if (!contracts.isCorrectNetwork) {
      const networkName = getAppChainDisplayName(contracts.testnetChain.id)
      return `${amountLine} (switch to ${networkName} to ${actionWhenOffChain}.)`
    }
    return amountLine
  }, [
    actionWhenOffChain,
    stellarMode,
    stellarConnected,
    stellar.loading,
    stellar.walletBalanceDisplay,
    contracts.isConnected,
    contracts.isContractsLoading,
    contracts.isCorrectNetwork,
    contracts.mockTokenBalanceFormatted,
    contracts.testnetChain.id,
  ])
}
