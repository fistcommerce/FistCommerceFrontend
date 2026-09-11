import type { AppWallet } from '@/wallet/appWallet'
import { isCircleAppWallet } from '@/wallet/appWallet'
import { clearCircleClientState } from '@/circle/storage'
import { resetCircleSdk } from '@/circle/sdk'

export const ACTIVE_WALLET_STORAGE_KEY = 'fistcommerce.activeWalletId'

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>
}

export function clearStoredActiveWalletId(): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ACTIVE_WALLET_STORAGE_KEY)
    }
  } catch {
    /* ignore */
  }
}

async function revokeAndDisconnectWallet(wallet: AppWallet | null): Promise<void> {
  try {
    const provider = (await wallet?.getEthereumProvider?.()) as Eip1193Provider | undefined
    if (provider?.request && !isCircleAppWallet(wallet)) {
      await provider.request({
        method: 'wallet_revokePermissions',
        params: [{ eth_accounts: {} }],
      })
    }
  } catch {
    /* ignore */
  }
  try {
    await Promise.resolve(wallet?.disconnect())
  } catch {
    /* ignore */
  }
}

/** Disconnect the linked wallet without ending the Privy login session. */
export async function disconnectLinkedWalletOnly(wallet: AppWallet | null): Promise<void> {
  await revokeAndDisconnectWallet(wallet)
  if (isCircleAppWallet(wallet)) {
    clearCircleClientState()
    resetCircleSdk()
  }
  clearStoredActiveWalletId()
}

/**
 * Best-effort client disconnect then Privy session end (skipped for Circle-only sessions).
 */
export async function disconnectPrivySession(
  wallet: AppWallet | null,
  logout: (() => Promise<void>) | undefined,
): Promise<void> {
  const circle = isCircleAppWallet(wallet)
  await revokeAndDisconnectWallet(wallet)
  if (circle) {
    clearCircleClientState()
    resetCircleSdk()
  }
  clearStoredActiveWalletId()
  if (!circle && typeof logout === 'function') {
    await logout()
  }
}

export const disconnectAppSession = disconnectPrivySession
