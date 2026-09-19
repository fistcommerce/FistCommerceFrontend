import { getAppStore } from '@/store/storeRef'
import type { FundingHopState } from '@/store/slices/walletSlice'

export type WalletBusySlice = {
  writePending?: boolean
  actionPending?: boolean
  fundingHop?: FundingHopState | null
}

/** True while a write, multi-step action, or deposit-scoped Circle/CCTP hop is in flight. */
export function isWalletSessionBusy(wallet: WalletBusySlice | null | undefined): boolean {
  if (!wallet) return false
  return Boolean(wallet.writePending || wallet.actionPending || wallet.fundingHop?.active)
}

export function isFundingHopActiveFromStore(): boolean {
  try {
    return Boolean(getAppStore()?.getState()?.wallet?.fundingHop?.active)
  } catch {
    return false
  }
}

export function getFundingHopFromStore(): FundingHopState | null {
  try {
    const hop = getAppStore()?.getState()?.wallet?.fundingHop
    if (!hop?.active) return null
    return {
      active: true,
      phase: (hop.phase as FundingHopState['phase']) ?? 'idle',
      sessionChainId: hop.sessionChainId,
      sessionWallet: hop.sessionWallet,
      hopChainId: hop.hopChainId,
      purpose: hop.purpose,
    }
  } catch {
    return null
  }
}
