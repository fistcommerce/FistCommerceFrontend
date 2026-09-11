import type { AppWallet } from '@/wallet/appWallet'
import { store } from '@/store'
import { setWalletFromProvider } from '@/store/slices/walletSlice'

export function parseEthChainId(raw: unknown): number | undefined {
  if (typeof raw === 'string' && raw.startsWith('0x')) {
    const n = Number.parseInt(raw, 16)
    return Number.isFinite(n) ? n : undefined
  }
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

export type SyncWalletChainOptions = {
  /** When true, skip dispatch (e.g. WalletReduxSync effect was cleaned up). */
  isCancelled?: () => boolean
}

/**
 * Reads `eth_chainId` from the active wallet provider and mirrors it into Redux.
 */
export async function syncWalletChainIdFromProviderToRedux(
  wallet: AppWallet,
  isConnected: boolean,
  address: string | null,
  options?: SyncWalletChainOptions,
): Promise<void> {
  try {
    const provider = await wallet.getEthereumProvider()
    const raw = await provider.request({ method: 'eth_chainId' })
    const n = parseEthChainId(raw)
    if (options?.isCancelled?.()) return
    store.dispatch(setWalletFromProvider({ isConnected, address, chainId: n }))
  } catch {
    if (options?.isCancelled?.()) return
    store.dispatch(setWalletFromProvider({ isConnected, address, chainId: undefined }))
  }
}
