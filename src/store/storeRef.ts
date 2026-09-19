/**
 * Late-bound store access so API modules (e.g. payout) and bridge helpers can
 * read session state / dispatch busy flags without a static store import cycle.
 */

export type AppStoreRef = {
  getState: () => {
    auth: {
      chainId?: number | null
      accessToken?: string | null
      refreshToken?: string | null
    }
    wallet: {
      chainId?: number | null
      writePending?: boolean
      actionPending?: boolean
      fundingHop?: {
        active: boolean
        phase?: string
        sessionChainId: number
        sessionWallet: string
        hopChainId: number | null
        purpose: 'deposit' | 'repayment' | null
      } | null
    }
  }
  dispatch: (action: unknown) => unknown
}

let appStore: AppStoreRef | null = null

/** Called once from `store/index` after `configureStore`. */
export function registerAppStore(next: AppStoreRef): void {
  appStore = next
}

/** Returns null until the store has finished booting. */
export function getAppStore(): AppStoreRef | null {
  return appStore
}
