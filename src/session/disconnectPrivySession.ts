import type { ConnectedWallet } from '@privy-io/react-auth'

export const ACTIVE_WALLET_STORAGE_KEY = 'fistcommerce.activeWalletId'

/** Injected wallets (e.g. MetaMask) can hang forever on revoke/disconnect prompts. */
const WALLET_DISCONNECT_TIMEOUT_MS = 1_500

/** Privy logout should be quick; bound it so UI never sticks on “Disconnecting…”. */
const PRIVY_LOGOUT_TIMEOUT_MS = 4_000

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>
}

export type DisconnectPrivyOptions = {
  /** From `usePrivy().unlinkWallet` — removes the wallet from the Privy user when allowed. */
  unlinkWallet?: (address: string) => Promise<unknown>
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

async function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      promise.catch(() => {
        /* ignore */
      }),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * Best-effort EIP-1193 revoke + connector disconnect.
 * Never waits longer than {@link WALLET_DISCONNECT_TIMEOUT_MS}.
 */
async function revokeAndDisconnectWallet(wallet: ConnectedWallet | null): Promise<void> {
  if (!wallet) return

  await withTimeout(
    (async () => {
      try {
        const provider = (await wallet.getEthereumProvider?.()) as Eip1193Provider | undefined
        if (provider?.request) {
          await provider.request({
            method: 'wallet_revokePermissions',
            params: [{ eth_accounts: {} }],
          })
        }
      } catch {
        /* ignore */
      }
      try {
        await Promise.resolve(wallet.disconnect())
      } catch {
        /* ignore */
      }
    })(),
    WALLET_DISCONNECT_TIMEOUT_MS,
  )
}

async function bestEffortUnlinkAndDisconnect(
  wallet: ConnectedWallet | null,
  options?: DisconnectPrivyOptions,
): Promise<void> {
  const address = wallet?.address?.trim()
  if (address && typeof options?.unlinkWallet === 'function') {
    await withTimeout(
      Promise.resolve(options.unlinkWallet(address)).then(() => undefined),
      WALLET_DISCONNECT_TIMEOUT_MS,
    )
  }
  await revokeAndDisconnectWallet(wallet)
}

/**
 * Clear the active wallet from Privy’s connected list.
 *
 * For external wallets, `wallet.disconnect()` is often a no-op while Privy is still
 * authenticated — callers that need the UI to show “not connected” must pass `logout`
 * (use {@link disconnectPrivySession}) or accept that the wallet may remain linked.
 */
export async function disconnectLinkedWalletOnly(
  wallet: ConnectedWallet | null,
  options?: DisconnectPrivyOptions & { logout?: () => Promise<void> },
): Promise<void> {
  // Prefer ending the Privy session when logout is available — that is what actually
  // drops MetaMask / WalletConnect from `useWallets()`.
  if (typeof options?.logout === 'function') {
    await disconnectPrivySession(wallet, options.logout, options)
    return
  }

  await bestEffortUnlinkAndDisconnect(wallet, options)
  clearStoredActiveWalletId()
}

/**
 * End Privy auth (required to disconnect most external wallets from the app).
 * Wallet revoke / unlink / connector disconnect are best-effort and time-bounded.
 */
export async function disconnectPrivySession(
  wallet: ConnectedWallet | null,
  logout: (() => Promise<void>) | undefined,
  options?: DisconnectPrivyOptions,
): Promise<void> {
  clearStoredActiveWalletId()

  // Never let MetaMask prompts block Privy logout.
  void bestEffortUnlinkAndDisconnect(wallet, options)

  if (typeof logout === 'function') {
    await withTimeout(logout(), PRIVY_LOGOUT_TIMEOUT_MS)
  }
}
