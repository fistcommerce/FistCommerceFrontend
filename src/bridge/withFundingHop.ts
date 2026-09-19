import {
  beginFundingHop,
  endFundingHop,
  setFundingHopPhase,
  type FundingHopPhase,
} from '@/store/slices/walletSlice'
import { getAppStore } from '@/store/storeRef'
import { withBridgeSessionBusy } from '@/bridge/withBridgeSessionBusy'

let fundingHopDepth = 0

export function getFundingHopDepth(): number {
  return fundingHopDepth
}

/** Test-only reset. */
export function __resetFundingHopDepthForTests(): void {
  fundingHopDepth = 0
}

export type FundingHopMeta = {
  sessionChainId: number
  sessionWallet: string
  hopChainId: number | null
  purpose: 'deposit' | 'repayment'
  phase?: FundingHopPhase
}

/**
 * Deposit/repay-scoped hop: sets fundingHop + nestable actionPending busy.
 * Keeps WalletReduxSync / enforcer from treating Circle address changes as logout.
 */
export async function withFundingHop<T>(meta: FundingHopMeta, fn: () => Promise<T>): Promise<T> {
  return withBridgeSessionBusy(async () => {
    const store = getAppStore()
    fundingHopDepth += 1
    if (fundingHopDepth === 1) {
      try {
        store?.dispatch(
          beginFundingHop({
            sessionChainId: meta.sessionChainId,
            sessionWallet: meta.sessionWallet,
            hopChainId: meta.hopChainId,
            purpose: meta.purpose,
            phase: meta.phase,
          }),
        )
      } catch {
        /* store may be unavailable in unit tests */
      }
    } else if (meta.phase) {
      try {
        store?.dispatch(setFundingHopPhase(meta.phase))
      } catch {
        /* ignore */
      }
    }
    try {
      return await fn()
    } finally {
      fundingHopDepth = Math.max(0, fundingHopDepth - 1)
      if (fundingHopDepth === 0) {
        try {
          store?.dispatch(endFundingHop())
        } catch {
          /* ignore */
        }
      }
    }
  })
}

export function setActiveFundingHopPhase(phase: FundingHopPhase): void {
  try {
    getAppStore()?.dispatch(setFundingHopPhase(phase))
  } catch {
    /* ignore */
  }
}
