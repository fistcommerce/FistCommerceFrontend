/** Minimal wallet shape used by signing, chain switch, and disconnect. Privy and Circle both satisfy this. */

export type AppWalletSource = 'privy' | 'circle'

export type AppEthereumProvider = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>
  on?: (event: string, listener: (...args: unknown[]) => void) => void
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void
}

export type AppWallet = {
  address: string
  walletClientType: string
  source: AppWalletSource
  getEthereumProvider: () => Promise<AppEthereumProvider>
  disconnect: () => Promise<void>
}

export function isCircleAppWallet(wallet: AppWallet | null | undefined): boolean {
  return wallet?.source === 'circle' || wallet?.walletClientType === 'circle'
}

export function wrapPrivyConnectedWallet(wallet: {
  address: string
  walletClientType: string
  getEthereumProvider: () => Promise<unknown>
  disconnect?: () => Promise<void> | void
}): AppWallet {
  return {
    address: wallet.address,
    walletClientType: wallet.walletClientType,
    source: 'privy',
    getEthereumProvider: async () => (await wallet.getEthereumProvider()) as AppEthereumProvider,
    disconnect: async () => {
      await Promise.resolve(wallet.disconnect?.())
    },
  }
}
