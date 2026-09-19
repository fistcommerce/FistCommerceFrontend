import { useEffect, useRef } from 'react'
import { usePrivy } from '@privy-io/react-auth'

import { logoutAdminSession } from '@/session/logoutAdminSession'
import { endAppSessionAndRedirect } from '@/session/sessionEnd'
import {
  ADMIN_LOGIN_PATH,
  isAdminDashboardPath,
  isAdminLoginPath,
  isAdminSession,
  shouldRedirectToAdminLogin,
} from '@/auth/adminSession'
import { store } from '@/store'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import type { AppDispatch } from '@/store'
import { patchAuth } from '@/store/slices/authSlice'
import { setWalletFromProvider } from '@/store/slices/walletSlice'
import { isWalletSessionBusy } from '@/wallet/sessionBusy'
import { syncWalletChainIdFromProviderToRedux } from '@/wallet/syncWalletChainToRedux'
import { useActiveWallet } from '@/wallet/useActiveWallet'
import type { SessionEndReason } from '@/session/sessionEnd'
import { isUsableApiAccessToken } from '@/auth/accessTokenPolicy'

/**
 * After idle, Privy/the wallet provider can briefly report an empty wallet list while `ready` is
 * true. Resetting immediately clears Redux and forces choose-role; wait before treating disconnect
 * as real when the user is still Privy-authenticated.
 */
const DISCONNECT_SESSION_RESET_MS = 10_000
/** Provider `eth_chainId` often flickers across supported chains on tab restore. */
const CHAIN_MISMATCH_LOGOUT_MS = 4_000
/** Privy wallet-list order can hop (e.g. MetaMask appearing after the login wallet). */
const WALLET_CHANGED_LOGOUT_MS = 4_000

function sameWalletAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = a?.trim().toLowerCase() ?? ''
  const right = b?.trim().toLowerCase() ?? ''
  return Boolean(left) && left === right
}

type Eip1193Emitter = {
  on?: (event: string, handler: (...args: unknown[]) => void) => void
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void
}

function isOnboardingPath(pathname: string): boolean {
  return pathname === '/onboarding' || pathname.startsWith('/onboarding/')
}

function hasUsableApiSession(): boolean {
  const { accessToken, refreshToken } = store.getState().auth
  return Boolean(refreshToken?.trim()) || isUsableApiAccessToken(accessToken)
}

/** Wallet disconnect / Privy logout routing for admin vs investor/merchant flows. */
function resetWalletAppSessionAndRedirect(dispatch: AppDispatch, reason: SessionEndReason) {
  const { sessionKind, accessToken, role } = store.getState().auth
  const pathname = typeof window !== 'undefined' ? window.location.pathname : ''

  // Admin sign-in screen: disconnect/reconnect is expected; stay on `/admin/login`.
  if (isAdminLoginPath(pathname)) return

  // Privy/wallet idle flicker is not an API logout. Keep the token; signing flows reconnect.
  if (
    (reason === 'wallet_disconnected' || reason === 'privy_logout') &&
    hasUsableApiSession()
  ) {
    dispatch(setWalletFromProvider({ isConnected: false, address: null, chainId: undefined }))
    return
  }

  // Mid-onboarding: wallet flicker / swap / chain change must not wipe progress or bounce to choose-role.
  // Tokens are wallet+chain-bound — clear them so Continue re-signs; keep role + step progress.
  if (
    pathname &&
    isOnboardingPath(pathname) &&
    (reason === 'wallet_disconnected' || reason === 'wallet_changed' || reason === 'chain_mismatch')
  ) {
    if (reason === 'wallet_disconnected') {
      dispatch(setWalletFromProvider({ isConnected: false, address: null, chainId: undefined }))
    }
    dispatch(patchAuth({ accessToken: null, refreshToken: null }))
    return
  }

  const onAdminDashboard = Boolean(pathname && isAdminDashboardPath(pathname))
  if (
    sessionKind === 'admin' ||
    (onAdminDashboard && isAdminSession(accessToken, sessionKind)) ||
    shouldRedirectToAdminLogin({ accessToken, sessionKind, pathname })
  ) {
    void logoutAdminSession(dispatch).catch(() => {
      window.location.assign(ADMIN_LOGIN_PATH)
    })
    return
  }

  void endAppSessionAndRedirect(dispatch, {
    reason,
    accessToken,
    sessionKind,
    role,
    keepRole: true,
  })
}

/**
 * Keeps Redux wallet mirror in sync with Privy.
 * Privy idle / empty wallet list does not destroy a valid API session.
 * A stable wallet address or chain change still forces re-login.
 */
export default function WalletReduxSync() {
  const dispatch = useAppDispatch()
  const { authenticated, ready: privyReady } = usePrivy()
  const { isConnected, address, wallet, ready: walletsReady, source } = useActiveWallet()

  // Keep chainId mirror updated from the active wallet provider.
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

  const sessionWallet = useAppSelector((s) => s.auth.wallet)
  const writePending = useAppSelector((s) => s.wallet.writePending)
  const actionPending = useAppSelector((s) => s.wallet.actionPending)
  const fundingHop = useAppSelector((s) => s.wallet.fundingHop)
  const sessionBusy = isWalletSessionBusy({ writePending, actionPending, fundingHop })
  const wasConnected = useRef(false)
  const lastAddress = useRef<string | null>(null)
  const lastSource = useRef<string | null>(null)
  /** Timer id (`number` in DOM; Node typings may use `Timeout`). */
  const disconnectResetTimerRef = useRef<number | null>(null)
  const walletChangeTimerRef = useRef<number | null>(null)
  const privyLogoutTimerRef = useRef<number | null>(null)
  const isConnectedRef = useRef(isConnected)
  const authenticatedRef = useRef(authenticated)
  const addressRef = useRef(address)
  isConnectedRef.current = isConnected
  authenticatedRef.current = authenticated
  addressRef.current = address

  useEffect(() => {
    return () => {
      if (disconnectResetTimerRef.current) {
        clearTimeout(disconnectResetTimerRef.current)
        disconnectResetTimerRef.current = null
      }
      if (walletChangeTimerRef.current) {
        clearTimeout(walletChangeTimerRef.current)
        walletChangeTimerRef.current = null
      }
      if (privyLogoutTimerRef.current) {
        clearTimeout(privyLogoutTimerRef.current)
        privyLogoutTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    // Privy can briefly report no linked wallets while `ready` is false; treating that as a
    // disconnect resets onboarding and sends users back to choose-role.
    if (!privyReady || !walletsReady) return

    const clearPendingDisconnectReset = () => {
      if (disconnectResetTimerRef.current) {
        clearTimeout(disconnectResetTimerRef.current)
        disconnectResetTimerRef.current = null
      }
    }
    const clearPendingWalletChange = () => {
      if (walletChangeTimerRef.current) {
        clearTimeout(walletChangeTimerRef.current)
        walletChangeTimerRef.current = null
      }
    }

    if (isConnected) {
      clearPendingDisconnectReset()
    }

    if (wasConnected.current && !isConnected) {
      const runDisconnectReset = () => {
        clearPendingDisconnectReset()
        resetWalletAppSessionAndRedirect(dispatch, 'wallet_disconnected')
      }

      // Privy-authenticated or Circle-only: debounce so restore flicker does not log out.
      if (authenticated || lastSource.current === 'circle' || source === 'circle') {
        clearPendingDisconnectReset()
        disconnectResetTimerRef.current = window.setTimeout(() => {
          disconnectResetTimerRef.current = null
          if (isConnectedRef.current) return
          runDisconnectReset()
        }, DISCONNECT_SESSION_RESET_MS)
      }
    }

    // Recovering to the session-bound wallet is not a user-initiated swap.
    if (
      sessionBusy ||
      sameWalletAddress(address, sessionWallet) ||
      sameWalletAddress(address, lastAddress.current)
    ) {
      clearPendingWalletChange()
    } else if (
      !sessionBusy &&
      wasConnected.current &&
      isConnected &&
      lastAddress.current &&
      address &&
      !sameWalletAddress(lastAddress.current, address)
    ) {
      if (walletChangeTimerRef.current) clearTimeout(walletChangeTimerRef.current)
      walletChangeTimerRef.current = window.setTimeout(() => {
        walletChangeTimerRef.current = null
        const next = addressRef.current
        if (!next) return
        const state = store.getState()
        if (state.wallet.writePending || state.wallet.actionPending || state.wallet.fundingHop?.active)
          return
        if (sameWalletAddress(next, state.auth.wallet)) return
        resetWalletAppSessionAndRedirect(dispatch, 'wallet_changed')
      }, WALLET_CHANGED_LOGOUT_MS)
    }
    wasConnected.current = isConnected
    lastAddress.current = address
    if (source) lastSource.current = source
  }, [
    dispatch,
    privyReady,
    walletsReady,
    isConnected,
    address,
    authenticated,
    sessionWallet,
    sessionBusy,
    source,
  ])

  const wasAuthenticated = useRef(false)
  useEffect(() => {
    if (!privyReady) return

    const clearPrivyLogoutTimer = () => {
      if (privyLogoutTimerRef.current) {
        clearTimeout(privyLogoutTimerRef.current)
        privyLogoutTimerRef.current = null
      }
    }

    if (authenticated) {
      clearPrivyLogoutTimer()
      wasAuthenticated.current = true
      return
    }

    if (!wasAuthenticated.current) return

    // Privy can drop `authenticated` briefly on tab restore; wait it out.
    if (privyLogoutTimerRef.current) clearTimeout(privyLogoutTimerRef.current)
    privyLogoutTimerRef.current = window.setTimeout(() => {
      privyLogoutTimerRef.current = null
      if (authenticatedRef.current) return
      if (isConnectedRef.current) return
      if (disconnectResetTimerRef.current) {
        clearTimeout(disconnectResetTimerRef.current)
        disconnectResetTimerRef.current = null
      }
      if (walletChangeTimerRef.current) {
        clearTimeout(walletChangeTimerRef.current)
        walletChangeTimerRef.current = null
      }
      resetWalletAppSessionAndRedirect(dispatch, 'privy_logout')
    }, DISCONNECT_SESSION_RESET_MS)
  }, [dispatch, privyReady, authenticated])

  // Chain change while logged in → automatic logout (app + admin).
  const authChainId = useAppSelector((s) => s.auth.chainId)
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const refreshToken = useAppSelector((s) => s.auth.refreshToken)
  const walletChainId = useAppSelector((s) => s.wallet.chainId)
  const lastBoundChainRef = useRef<number | null>(null)
  const chainLogoutTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (chainLogoutTimerRef.current) {
        clearTimeout(chainLogoutTimerRef.current)
        chainLogoutTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const hasTokens =
      Boolean(refreshToken?.trim()) || isUsableApiAccessToken(accessToken)
    if (!hasTokens || authChainId == null) {
      lastBoundChainRef.current = authChainId
      return
    }
    // Wait for a real provider chain before treating mismatch as a user switch.
    if (!privyReady || !walletsReady || walletChainId == null || sessionBusy) {
      if (sessionBusy && chainLogoutTimerRef.current) {
        clearTimeout(chainLogoutTimerRef.current)
        chainLogoutTimerRef.current = null
      }
      return
    }

    // Establish baseline after login without treating first sync as a change.
    if (lastBoundChainRef.current == null) {
      lastBoundChainRef.current = authChainId
    }

    if (walletChainId === authChainId) {
      lastBoundChainRef.current = authChainId
      if (chainLogoutTimerRef.current) {
        clearTimeout(chainLogoutTimerRef.current)
        chainLogoutTimerRef.current = null
      }
      return
    }

    // Debounce brief provider flicker before logging out.
    if (chainLogoutTimerRef.current) clearTimeout(chainLogoutTimerRef.current)
    chainLogoutTimerRef.current = window.setTimeout(() => {
      chainLogoutTimerRef.current = null
      const state = store.getState()
      const stillHasTokens =
        Boolean(state.auth.refreshToken?.trim()) ||
        isUsableApiAccessToken(state.auth.accessToken)
      if (!stillHasTokens) return
      if (state.auth.chainId == null) return
      if (state.wallet.chainId == null) return
      if (state.wallet.chainId === state.auth.chainId) return
      if (state.wallet.writePending || state.wallet.actionPending || state.wallet.fundingHop?.active)
        return
      lastBoundChainRef.current = null
      resetWalletAppSessionAndRedirect(dispatch, 'chain_mismatch')
    }, CHAIN_MISMATCH_LOGOUT_MS)
  }, [dispatch, authChainId, accessToken, refreshToken, walletChainId, privyReady, walletsReady, sessionBusy])

  return null
}
