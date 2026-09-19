import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  fetchBridgeBalances,
  fetchBridgeConfig,
  mergeBridgeBalanceRows,
  type BridgeConfig,
  type BridgeEligibleBalance,
  type BridgePurpose,
} from '@/api/bridge'
import {
  filterBalancesForCircleWallet,
  filterBalancesToAccepted,
} from '@/bridge/acceptedSources'
import { useAppSelector } from '@/store/hooks'
import { isCircleAppWallet } from '@/wallet/appWallet'
import { useActiveWallet } from '@/wallet/useActiveWallet'

function parseBalanceHuman(raw: string | null | undefined): number | null {
  if (raw == null || raw === '') return null
  const n = Number(String(raw).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

export function useUsdcBalancePicker(params: {
  purpose: BridgePurpose
  amountHuman: number
  enabled?: boolean
}) {
  const accessToken = useAppSelector((s) => s.auth?.accessToken ?? null)
  const { wallet, source } = useActiveWallet()
  const isCircleWallet = source === 'circle' && isCircleAppWallet(wallet)
  // Soft hint only — CCTP is allowed under deposit-scoped funding hops.
  const circleSessionLocked = false
  const circleMultiAddressHint = isCircleWallet

  const [balances, setBalances] = useState<BridgeEligibleBalance[]>([])
  const [bridgeConfig, setBridgeConfig] = useState<BridgeConfig | null>(null)
  const [selectedChainId, setSelectedChainId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amountKey =
    params.amountHuman > 0 && Number.isFinite(params.amountHuman)
      ? String(params.amountHuman)
      : ''

  const refresh = useCallback(async () => {
    if (params.enabled === false) return
    if (!accessToken?.trim()) {
      setBalances([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [config, res] = await Promise.all([
        fetchBridgeConfig().catch(() => null),
        fetchBridgeBalances(accessToken, {
          purpose: params.purpose,
          amount: amountKey || undefined,
        }).catch((e) => {
          // Keep config-based chain list visible even if balances call fails.
          if (import.meta.env.DEV) {
            console.warn('[useUsdcBalancePicker] balances fetch failed', e)
          }
          return { purpose: params.purpose, amount: null, wallet: '', balances: [] as BridgeEligibleBalance[] }
        }),
      ])
      if (config) setBridgeConfig(config)
      let next = mergeBridgeBalanceRows(config, res.balances ?? [])
      next = filterBalancesToAccepted(next, config)
      next = filterBalancesForCircleWallet(next, isCircleWallet)
      setBalances(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load USDC balances')
      setBalances([])
    } finally {
      setLoading(false)
    }
  }, [accessToken, amountKey, isCircleWallet, params.enabled, params.purpose])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const selected = useMemo(() => {
    if (selectedChainId != null) {
      const hit = balances.find((b) => b.chainId === selectedChainId)
      if (hit) return hit
    }
    const arc = balances.find((b) => !b.requiresBridge)
    if (arc?.sufficient) return arc
    const ok = balances.find((b) => b.sufficient)
    if (ok) return ok
    return arc ?? balances[0] ?? null
  }, [balances, selectedChainId])

  useEffect(() => {
    if (selected && selectedChainId == null) {
      setSelectedChainId(selected.chainId)
    }
  }, [selected, selectedChainId])

  // If Circle lock drops CCTP selection, snap to Arc / first remaining row.
  useEffect(() => {
    if (!selectedChainId) return
    if (balances.some((b) => b.chainId === selectedChainId)) return
    setSelectedChainId(balances[0]?.chainId ?? null)
  }, [balances, selectedChainId])

  const selectedBalanceHuman = parseBalanceHuman(selected?.balance)

  return {
    balances,
    bridgeConfig,
    selected,
    selectedChainId: selected?.chainId ?? selectedChainId,
    setSelectedChainId,
    selectedBalanceHuman,
    loading,
    error,
    refresh,
    circleSessionLocked,
    circleMultiAddressHint,
  }
}
