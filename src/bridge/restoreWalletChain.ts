import { isUsableApiAccessToken } from '@/auth/accessTokenPolicy'
import { isCircleAppWallet, type AppWallet } from '@/wallet/appWallet'
import { getAppChainById } from '@/wallet/appChain'
import { isFundingHopActiveFromStore } from '@/wallet/sessionBusy'
import { ensureWalletChain } from '@/wallet/viemClients'
import { getAppStore } from '@/store/storeRef'

function hasFistSessionTokens(): boolean {
  try {
    const auth = getAppStore()?.getState()?.auth
    return Boolean(auth?.refreshToken?.trim()) || isUsableApiAccessToken(auth?.accessToken)
  } catch {
    return false
  }
}

/**
 * Best-effort return to the pre-flow / auth chain after Arc deposit or repay.
 * During funding hop cleanup, Circle may switch back to the session (Arc) chain.
 */
export async function restoreWalletChainIfSafe(
  wallet: AppWallet | null | undefined,
  chainId: number | null | undefined,
): Promise<void> {
  if (!wallet || chainId == null || !Number.isFinite(chainId)) return
  if (!getAppChainById(chainId)) return
  if (isCircleAppWallet(wallet) && hasFistSessionTokens() && !isFundingHopActiveFromStore()) {
    // Outside a funding hop, Circle address changes would fight the Fist session.
    // Prefer no-op; ensureArcUsdc / withFundingHop already lands on Arc under hop.
    return
  }
  try {
    await ensureWalletChain(wallet, chainId)
  } catch {
    /* best-effort; deposit/repay already succeeded or failed independently */
  }
}

export function resolveOriginatingChainId(params: {
  authChainId?: number | null
  walletChainId?: number | null
}): number | null {
  if (params.authChainId != null && Number.isFinite(params.authChainId)) return params.authChainId
  if (params.walletChainId != null && Number.isFinite(params.walletChainId)) return params.walletChainId
  return null
}
