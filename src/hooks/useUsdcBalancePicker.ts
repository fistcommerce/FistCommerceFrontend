import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  fetchBridgeBalances,
  type BridgeEligibleBalance,
  type BridgePurpose,
} from '@/api/bridge'
import { useAppSelector } from '@/store/hooks'

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
  const [balances, setBalances] = useState<BridgeEligibleBalance[]>([])
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
      const res = await fetchBridgeBalances(accessToken, {
        purpose: params.purpose,
        amount: amountKey || undefined,
      })
      setBalances(res.balances ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load USDC balances')
      setBalances([])
    } finally {
      setLoading(false)
    }
  }, [accessToken, amountKey, params.enabled, params.purpose])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const selected = useMemo(() => {
    if (selectedChainId != null) {
      const hit = balances.find((b) => b.chainId === selectedChainId)
      if (hit) return hit
    }
    // Prefer Arc when sufficient, else first sufficient, else Arc row, else first.
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

  const selectedBalanceHuman = parseBalanceHuman(selected?.balance)

  return {
    balances,
    selected,
    selectedChainId: selected?.chainId ?? selectedChainId,
    setSelectedChainId,
    selectedBalanceHuman,
    loading,
    error,
    refresh,
  }
}
