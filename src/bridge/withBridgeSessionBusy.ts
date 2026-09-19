import { setWalletActionPending } from '@/store/slices/walletSlice'
import { getAppStore } from '@/store/storeRef'

/**
 * Nestable busy flag for CCTP / multi-chain funding.
 * Keeps WalletReduxSync from logging out on chain_mismatch while hops are in flight.
 * Depth-counted so an outer confirm wrapper and inner ensureArcUsdc share one flag.
 */
let bridgeBusyDepth = 0

export function getBridgeSessionBusyDepth(): number {
  return bridgeBusyDepth
}

/** Test-only reset. */
export function __resetBridgeSessionBusyDepthForTests(): void {
  bridgeBusyDepth = 0
}

export async function withBridgeSessionBusy<T>(fn: () => Promise<T>): Promise<T> {
  const store = getAppStore()
  bridgeBusyDepth += 1
  if (bridgeBusyDepth === 1) {
    try {
      store?.dispatch(setWalletActionPending(true))
    } catch {
      /* store may be unavailable in unit tests */
    }
  }
  try {
    return await fn()
  } finally {
    bridgeBusyDepth = Math.max(0, bridgeBusyDepth - 1)
    if (bridgeBusyDepth === 0) {
      try {
        store?.dispatch(setWalletActionPending(false))
      } catch {
        /* ignore */
      }
    }
  }
}
