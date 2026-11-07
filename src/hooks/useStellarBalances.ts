import { useCallback, useEffect, useState } from 'react'

import {
  fetchFistUsdClassicBalance,
  fetchInvestorPoolUnits,
  fistUsdFromStroops,
  formatUsdDisplay,
} from '@/stellar/reads'
import { useAppSelector } from '@/store/hooks'
import { useIsStellarTestnetMode } from '@/hooks/usePreferredAppNetwork'
import { useWallet } from '@/hooks/useWallet'

type StellarBalancesState = {
  loading: boolean
  error: string | null
  walletBalanceHuman: number | null
  investmentBalanceHuman: number | null
  walletBalanceDisplay: string
  investmentBalanceDisplay: string
  refresh: () => void
}

/**
 * Horizon FISTUSD balance + Soroban pool units for the active Stellar session.
 */
export function useStellarBalances(): StellarBalancesState {
  const stellarMode = useIsStellarTestnetMode()
  const { address, isConnected } = useWallet()
  const authWallet = useAppSelector((s) => s.auth.wallet)
  const target = (address || authWallet || '').trim().toUpperCase() || null

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [walletHuman, setWalletHuman] = useState<number | null>(null)
  const [investHuman, setInvestHuman] = useState<number | null>(null)
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    if (!stellarMode || !target || !isConnected) {
      setWalletHuman(null)
      setInvestHuman(null)
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const [wallet, units] = await Promise.all([
          fetchFistUsdClassicBalance(target),
          fetchInvestorPoolUnits(target).catch(() => 0n),
        ])
        if (cancelled) return
        setWalletHuman(wallet)
        setInvestHuman(fistUsdFromStroops(units))
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Could not load Stellar balances.')
        setWalletHuman(null)
        setInvestHuman(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [stellarMode, target, isConnected, tick])

  return {
    loading,
    error,
    walletBalanceHuman: walletHuman,
    investmentBalanceHuman: investHuman,
    walletBalanceDisplay: loading ? 'Loading…' : formatUsdDisplay(walletHuman),
    investmentBalanceDisplay: loading ? 'Loading…' : formatUsdDisplay(investHuman),
    refresh,
  }
}
