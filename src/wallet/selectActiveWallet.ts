import type { ConnectedWallet } from '@privy-io/react-auth'

export type ActiveWalletSelectionOptions = {
  /** Optional persisted id/address for user-chosen active wallet. */
  preferredWalletId?: string | null
}

function isEmbeddedWallet(w: ConnectedWallet): boolean {
  return w.walletClientType === 'privy'
}

function isWalletConnectWallet(w: ConnectedWallet): boolean {
  return w.walletClientType === 'wallet_connect'
}

/**
 * Deterministically select an active wallet from Privy wallets.
 *
 * A preferred address that is not in the list stays unresolved. Falling through
 * to MetaMask or an embedded wallet looks like a wallet change and ends the session.
 *
 * Priority when nothing is preferred:
 * 1) injected (metamask, phantom, then any other non-WC / non-embedded)
 * 2) wallet_connect
 * 3) privy (embedded)
 * 4) fallback to first
 */
export function selectActiveWallet(
  wallets: readonly ConnectedWallet[] | null | undefined,
  opts?: ActiveWalletSelectionOptions,
): ConnectedWallet | null {
  if (!wallets?.length) return null

  const preferred = (opts?.preferredWalletId ?? '').trim()
  if (preferred) {
    return (
      wallets.find((w) => (w.address ?? '').toLowerCase() === preferred.toLowerCase()) ?? null
    )
  }

  const injectedPriority = new Set(['metamask', 'phantom'])
  const prioritizedInjected = wallets.find((w) => injectedPriority.has(w.walletClientType))
  if (prioritizedInjected) return prioritizedInjected

  const anyInjected = wallets.find((w) => !isEmbeddedWallet(w) && !isWalletConnectWallet(w))
  if (anyInjected) return anyInjected

  const wc = wallets.find((w) => isWalletConnectWallet(w))
  if (wc) return wc

  const embedded = wallets.find((w) => isEmbeddedWallet(w))
  if (embedded) return embedded

  return wallets[0] ?? null
}

