import { useWallets, type ConnectedWallet } from '@privy-io/react-auth'
import { useCallback, useMemo, useState } from 'react'

import { useCircleWallet } from '@/circle/CircleWalletProvider'
import { isCircleWalletEnabled } from '@/circle/enabled'
import { useAppSelector } from '@/store/hooks'
import {
  wrapPrivyConnectedWallet,
  type AppWallet,
  type AppWalletSource,
} from '@/wallet/appWallet'

import { selectActiveWallet } from './selectActiveWallet'

export const ACTIVE_WALLET_STORAGE_KEY = 'fistcommerce.activeWalletId'

function safeGetStorageItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSetStorageItem(key: string, value: string | null) {
  try {
    if (!value) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // ignore (storage disabled)
  }
}

export type UseActiveWalletOptions = {
  /** Admin login ignores Circle so multisig owners keep using Privy wallets. */
  includeCircle?: boolean
}

export type UseActiveWalletResult = {
  wallets: readonly ConnectedWallet[]
  wallet: AppWallet | null
  address: string | null
  walletClientType: string | null
  source: AppWalletSource | null
  isConnected: boolean
  activeWalletId: string | null
  setActiveWalletId: (next: string | null) => void
  /** True once Privy wallets and Circle restore have finished initializing. */
  ready: boolean
}

export function useActiveWallet(opts?: UseActiveWalletOptions): UseActiveWalletResult {
  const includeCircle = opts?.includeCircle !== false
  const { wallets, ready: privyReady } = useWallets()
  const circle = useCircleWallet()
  const sessionWallet = useAppSelector((s) => s.auth.wallet)
  const [activeWalletIdState, setActiveWalletIdState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return safeGetStorageItem(ACTIVE_WALLET_STORAGE_KEY)
  })

  const setActiveWalletId = useCallback((next: string | null) => {
    const normalized = next?.trim() ? next.trim() : null
    setActiveWalletIdState(normalized)
    if (typeof window !== 'undefined') {
      safeSetStorageItem(ACTIVE_WALLET_STORAGE_KEY, normalized)
    }
  }, [])

  const preferredWalletId = activeWalletIdState?.trim() || sessionWallet?.trim() || null

  const privyWallet = useMemo(() => {
    return selectActiveWallet(wallets, { preferredWalletId })
  }, [wallets, preferredWalletId])

  const circleWallet =
    includeCircle && isCircleWalletEnabled() && circle.wallet ? circle.wallet : null

  const wallet = circleWallet ?? (privyWallet ? wrapPrivyConnectedWallet(privyWallet) : null)
  const address = wallet?.address ?? null
  const walletClientType = wallet?.walletClientType ?? null
  const source = wallet?.source ?? null
  const isConnected = Boolean(wallet && address)
  const ready = privyReady && circle.ready

  return {
    wallets,
    wallet,
    address,
    walletClientType,
    source,
    isConnected,
    activeWalletId: activeWalletIdState,
    setActiveWalletId,
    ready,
  }
}
