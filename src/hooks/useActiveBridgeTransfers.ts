import { useQuery } from '@tanstack/react-query'

import { fetchBridgeTransfers, type BridgePurpose, type BridgeTransfer } from '@/api/bridge'
import { isInFlightBridgeStatus } from '@/bridge/transferStatus'
import { useAppSelector } from '@/store/hooks'

export function useActiveBridgeTransfers(params?: { purpose?: BridgePurpose; enabled?: boolean }) {
  const accessToken = useAppSelector((s) => s.auth?.accessToken ?? null)
  const enabled = params?.enabled !== false && Boolean(accessToken?.trim())

  const query = useQuery({
    queryKey: ['bridge-transfers', 'list', params?.purpose ?? 'all', accessToken],
    enabled,
    queryFn: () =>
      fetchBridgeTransfers(accessToken, {
        purpose: params?.purpose,
      }),
    refetchInterval: (q) => {
      const rows = q.state.data ?? []
      return rows.some((row) => isInFlightBridgeStatus(row.status)) ? 8000 : false
    },
  })

  const transfers: BridgeTransfer[] = query.data ?? []

  return {
    transfers,
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}
