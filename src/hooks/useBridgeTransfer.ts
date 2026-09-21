import { useQuery } from '@tanstack/react-query'

import { fetchBridgeTransfer } from '@/api/bridge'
import { isAwaitingMintStatus, isInFlightBridgeStatus, transferNeedsSignature } from '@/bridge/transferStatus'
import { useAppSelector } from '@/store/hooks'

export function useBridgeTransfer(transferId: string | null | undefined) {
  const accessToken = useAppSelector((s) => s.auth?.accessToken ?? null)
  const id = transferId?.trim() ?? ''
  const enabled = Boolean(accessToken?.trim() && id)

  const query = useQuery({
    queryKey: ['bridge-transfer', id, accessToken],
    enabled,
    queryFn: () => fetchBridgeTransfer(accessToken, id),
    refetchInterval: (q) => {
      const row = q.state.data
      if (!row) return false
      if (transferNeedsSignature(row)) return false
      return isAwaitingMintStatus(row.status) || isInFlightBridgeStatus(row.status) ? 4000 : false
    },
  })

  return {
    transfer: query.data ?? null,
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}
