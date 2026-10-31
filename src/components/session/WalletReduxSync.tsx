import { useEffect } from 'react'

import { useAppDispatch } from '@/store/hooks'
import { setWalletFromProvider } from '@/store/slices/walletSlice'
import { syncWalletChainIdFromProviderToRedux } from '@/wallet/syncWalletChainToRedux'
import { useActiveWallet } from '@/wallet/useActiveWallet'

type Eip1193Emitter = {
  on?: (event: string, handler: (...args: unknown[]) => void) => void
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void
}

/**
 * Mirrors the active Privy wallet into Redux.
 * Wallet disconnects, account hops, and chain changes do not end the API session.
 * The account stays signed in until the server says the login has expired.
 */
export default function WalletReduxSync() {
  const dispatch = useAppDispatch()
  const { isConnected, address, wallet } = useActiveWallet()

  useEffect(() => {
    let cancelled = false
    let detachProviderListeners: (() => void) | undefined
    let clearPollInterval: (() => void) | undefined

    if (!wallet || !isConnected) {
      dispatch(setWalletFromProvider({ isConnected, address, chainId: undefined }))
      return () => {
        cancelled = true
      }
    }

    const pushChainIdFromProvider = async () => {
      await syncWalletChainIdFromProviderToRedux(wallet, isConnected, address, {
        isCancelled: () => cancelled,
      })
    }

    void (async () => {
      await pushChainIdFromProvider()
      if (cancelled) return
      let listenersAttached = false
      try {
        const provider = await wallet.getEthereumProvider()
        if (cancelled) return
        const emitter = provider as unknown as Eip1193Emitter
        const onChainChanged = () => {
          void pushChainIdFromProvider()
        }
        const onAccountsChanged = () => {
          void pushChainIdFromProvider()
        }
        if (typeof emitter.on === 'function') {
          emitter.on('chainChanged', onChainChanged)
          emitter.on('accountsChanged', onAccountsChanged)
          detachProviderListeners = () => {
            emitter.removeListener?.('chainChanged', onChainChanged)
            emitter.removeListener?.('accountsChanged', onAccountsChanged)
          }
          listenersAttached = true
        }
      } catch {
        /* ignore */
      }
      if (!listenersAttached && !cancelled) {
        const pollId = window.setInterval(() => {
          void pushChainIdFromProvider()
        }, 2000)
        clearPollInterval = () => window.clearInterval(pollId)
      }
    })()

    return () => {
      cancelled = true
      detachProviderListeners?.()
      clearPollInterval?.()
    }
  }, [dispatch, wallet, isConnected, address])

  return null
}
