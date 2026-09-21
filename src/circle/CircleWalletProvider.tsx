import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { getAddress, type Address } from 'viem'

import {
  circleEnsureChallengeId,
  postCircleAuthComplete,
  postCircleEmailToken,
  postCircleEnsureWallet,
  postCircleSession,
  postCircleSessionRefresh,
  postCircleSocialToken,
  postCircleUserTokenRefresh,
} from '@/circle/api'
import {
  getCircleSwitchChainById,
  isCircleLoginChainId,
  isCircleSupportedChainId,
} from '@/circle/chainMap'
import { isFundingHopActiveFromStore } from '@/wallet/sessionBusy'
import {
  circleWalletUnavailableReason,
  getCircleAppId,
  isCircleAuthMethodConfigured,
  isCircleWalletEnabled,
} from '@/circle/enabled'
import { CircleUserRejectedError, isCircleUserRejectedError } from '@/circle/errors'
import {
  authenticateCircleSdk,
  awaitCircleSocialLoginReturn,
  executeCircleChallenge,
  getCircleSdkDeviceId,
  isSocialCircleAuthMethod,
  performCircleEmailOtpLogin,
  performCircleSocialLogin,
  resetCircleSdk,
} from '@/circle/sdk'
import { createCircleAppWallet } from '@/circle/adapter'
import {
  clearCircleClientState,
  getOrCreateCircleDeviceId,
  readCircleSecrets,
  readCircleSocialPending,
  readCircleWalletRef,
  writeCirclePinUserId,
  writeCircleSecrets,
  writeCircleSocialPending,
  writeCircleWalletRef,
} from '@/circle/storage'
import type {
  CircleAuthMethod,
  CircleConnectOptions,
  CircleLiveSession,
  CircleWalletRecord,
} from '@/circle/types'
import { isUsableApiAccessToken } from '@/auth/accessTokenPolicy'
import { isLocalOnlyDeployMode } from '@/contract_config/contractNetwork'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { selectIsPersistReady } from '@/store/selectors/sessionSelectors'
import {
  endFundingHop,
  setWalletActionPending,
  setWalletFromProvider,
  setWalletWritePending,
} from '@/store/slices/walletSlice'
import type { AppWallet } from '@/wallet/appWallet'
import { WalletChainSwitchError } from '@/wallet/walletChainErrors'

type CircleWalletContextValue = {
  ready: boolean
  wallet: AppWallet | null
  session: CircleLiveSession | null
  actionPending: boolean
  connect: (
    chainId: number,
    method: CircleAuthMethod,
    options?: CircleConnectOptions,
  ) => Promise<AppWallet>
  disconnect: () => Promise<void>
  switchChain: (chainId: number, opts?: { allowAddressChange?: boolean }) => Promise<void>
}

const CircleWalletContext = createContext<CircleWalletContextValue | null>(null)

function assertEoa(wallet: CircleWalletRecord): CircleWalletRecord {
  if (wallet.accountType && wallet.accountType !== 'EOA') {
    throw new Error('This Circle account type is not supported. Use an EOA Circle wallet.')
  }
  return wallet
}

function toLiveSession(
  secrets: {
    userToken: string
    encryptionKey: string
    appId: string
    refreshToken?: string | null
  },
  wallet: CircleWalletRecord,
  authMethod?: CircleAuthMethod | string | null,
): CircleLiveSession {
  return {
    userToken: secrets.userToken,
    encryptionKey: secrets.encryptionKey,
    appId: secrets.appId || getCircleAppId(),
    refreshToken: secrets.refreshToken ?? null,
    walletId: wallet.walletId,
    address: getAddress(wallet.address as Address),
    chainId: wallet.chainId,
    authMethod: authMethod ?? null,
  }
}

export function CircleWalletProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch()
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const authChainId = useAppSelector((s) => s.auth.chainId)
  const persistReady = useAppSelector(selectIsPersistReady)
  const [session, setSession] = useState<CircleLiveSession | null>(null)
  const [ready, setReady] = useState(false)
  const [actionPending, setActionPending] = useState(false)
  const sessionRef = useRef<CircleLiveSession | null>(null)
  sessionRef.current = session

  // Clear stuck hop/busy flags after refresh / HMR so balance reads and UI are not gated.
  useEffect(() => {
    dispatch(endFundingHop())
    dispatch(setWalletActionPending(false))
    dispatch(setWalletWritePending(false))
  }, [dispatch])

  const persist = useCallback(
    (next: CircleLiveSession | null) => {
      sessionRef.current = next
      setSession(next)
      if (!next) {
        clearCircleClientState()
        resetCircleSdk()
        return
      }
      writeCircleSecrets({
        userToken: next.userToken,
        encryptionKey: next.encryptionKey,
        appId: next.appId,
        refreshToken: next.refreshToken ?? null,
      })
      writeCircleWalletRef({
        walletId: next.walletId,
        address: next.address,
        chainId: next.chainId,
      })
      // Mirror into Redux immediately so balance reads / session selectors do not wait
      // on WalletReduxSync's async provider poll.
      try {
        dispatch(
          setWalletFromProvider({
            isConnected: true,
            address: next.address,
            chainId: next.chainId,
          }),
        )
      } catch {
        /* store may be unavailable in tests */
      }
    },
    [dispatch],
  )

  const withPending = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      setActionPending(true)
      dispatch(setWalletActionPending(true))
      dispatch(setWalletWritePending(true))
      try {
        return await fn()
      } catch (e) {
        if (isCircleUserRejectedError(e)) throw new CircleUserRejectedError()
        throw e
      } finally {
        setActionPending(false)
        // Do not clear actionPending while an outer funding hop is active
        // (Circle switch nests inside CCTP and would otherwise stomp the busy gate).
        // Always clear this call's writePending — hop busy is fundingHop + actionPending.
        dispatch(setWalletWritePending(false))
        if (isFundingHopActiveFromStore()) {
          dispatch(setWalletActionPending(true))
        } else {
          dispatch(setWalletActionPending(false))
        }
      }
    },
    [dispatch],
  )

  const disconnect = useCallback(async () => {
    persist(null)
  }, [persist])

  const applyWallet = useCallback(
    async (
      secrets: {
        userToken: string
        encryptionKey: string
        appId: string
        refreshToken?: string | null
      },
      chainId: number,
      existing?: CircleWalletRecord | null,
      authMethod?: CircleAuthMethod | string | null,
    ): Promise<CircleLiveSession> => {
      await authenticateCircleSdk(secrets)
      let wallet: CircleWalletRecord
      const existingMatchesTarget =
        Boolean(existing?.address) &&
        existing != null &&
        Number.isFinite(existing.chainId) &&
        Math.trunc(existing.chainId) === Math.trunc(chainId)
      if (existingMatchesTarget && existing) {
        wallet = assertEoa(existing)
      } else {
        try {
          wallet = assertEoa(
            await postCircleEnsureWallet({
              chainId,
              userToken: secrets.userToken,
              accessToken,
            }),
          )
        } catch (e) {
          const challengeId = circleEnsureChallengeId(e) ?? ''
          if (challengeId) {
            await executeCircleChallenge(challengeId, secrets)
            wallet = assertEoa(
              await postCircleEnsureWallet({
                chainId,
                userToken: secrets.userToken,
                accessToken,
              }),
            )
          } else {
            throw e
          }
        }
      }
      if (!isCircleSupportedChainId(wallet.chainId) && !isCircleSupportedChainId(chainId)) {
        throw new Error('Circle Wallet is on an unsupported network.')
      }
      // Normalize to the requested chain — ensure-wallet is chain-scoped; API records can drift.
      wallet = { ...wallet, chainId: Math.trunc(chainId) }
      if (!isCircleSupportedChainId(wallet.chainId)) {
        throw new Error('Circle Wallet is on an unsupported network.')
      }
      const live = toLiveSession(secrets, wallet, authMethod)
      persist(live)
      return live
    },
    [accessToken, persist],
  )

  const finishWithCredentials = useCallback(
    async (params: {
      userToken: string
      encryptionKey: string
      appId: string
      refreshToken?: string | null
      chainId: number
      method: CircleAuthMethod
      email?: string
      challengeId?: string | null
      wallet?: CircleWalletRecord | null
    }) => {
      const secrets = {
        userToken: params.userToken,
        encryptionKey: params.encryptionKey,
        appId: params.appId || getCircleAppId(),
        refreshToken: params.refreshToken ?? null,
      }
      await authenticateCircleSdk(secrets)
      if (params.challengeId) {
        await executeCircleChallenge(params.challengeId, secrets)
      }
      await applyWallet(secrets, params.chainId, params.wallet, params.method)
      return createCircleAppWallet({
        getSession: () => {
          const current = sessionRef.current
          if (!current) throw new Error('Circle Wallet is disconnected.')
          return current
        },
        switchChain: (nextChainId) => switchChainRef.current(nextChainId, { allowAddressChange: true }),
        onDisconnect: disconnect,
      })
    },
    [applyWallet, disconnect],
  )

  const connect = useCallback(
    async (chainId: number, method: CircleAuthMethod, options?: CircleConnectOptions) => {
      const blocked = circleWalletUnavailableReason()
      if (blocked) throw new Error(blocked)
      if (!isCircleLoginChainId(chainId)) {
        throw new Error('Circle Wallet login is only available on supported Fist networks.')
      }
      if (!isCircleAuthMethodConfigured(method)) {
        throw new Error(`Circle ${method} login is not configured in this environment.`)
      }

      return withPending(async () => {
        if (method === 'pin') {
          const pinUserId = options?.pinUserId?.trim()
          if (!pinUserId || pinUserId.length < 5) {
            throw new Error('Enter a PIN user ID of at least 5 characters (Circle docs).')
          }
          writeCirclePinUserId(pinUserId)
          const created = await postCircleSession({
            pinUserId,
            deviceId: getOrCreateCircleDeviceId(),
            chainId,
            accessToken,
          })
          return finishWithCredentials({
            userToken: created.userToken,
            encryptionKey: created.encryptionKey,
            appId: created.appId || getCircleAppId(),
            chainId,
            method: 'pin',
            challengeId: created.challengeId,
            wallet: created.wallet,
          })
        }

        if (method === 'email') {
          const email = options?.email?.trim().toLowerCase()
          if (!email || !email.includes('@')) {
            throw new Error('Enter a valid email for Circle email OTP.')
          }
          const deviceId = await getCircleSdkDeviceId()
          const tokens = await postCircleEmailToken({ deviceId, email, accessToken })
          const login = await performCircleEmailOtpLogin({
            email,
            deviceToken: tokens.deviceToken,
            deviceEncryptionKey: tokens.deviceEncryptionKey,
            otpToken: tokens.otpToken!,
            appId: tokens.appId || getCircleAppId(),
          })
          const completed = await postCircleAuthComplete({
            chainId,
            userToken: login.userToken,
            authMethod: 'email',
            email,
            accessToken,
          })
          return finishWithCredentials({
            userToken: login.userToken,
            encryptionKey: login.encryptionKey,
            appId: completed.appId || tokens.appId || getCircleAppId(),
            refreshToken: login.refreshToken,
            chainId,
            method: 'email',
            email,
            challengeId: completed.challengeId,
            wallet: completed.wallet,
          })
        }

        if (isSocialCircleAuthMethod(method)) {
          const deviceId = await getCircleSdkDeviceId()
          const tokens = await postCircleSocialToken({ deviceId, accessToken })
          const redirectUri = typeof window !== 'undefined' ? window.location.origin : ''
          writeCircleSocialPending({
            deviceToken: tokens.deviceToken,
            deviceEncryptionKey: tokens.deviceEncryptionKey,
            provider: method,
            chainId,
            redirectUri,
          })
          const login = await performCircleSocialLogin({
            provider: method,
            deviceToken: tokens.deviceToken,
            deviceEncryptionKey: tokens.deviceEncryptionKey,
            appId: tokens.appId || getCircleAppId(),
            redirectUri,
          })
          writeCircleSocialPending(null)
          const completed = await postCircleAuthComplete({
            chainId,
            userToken: login.userToken,
            authMethod: method,
            accessToken,
          })
          return finishWithCredentials({
            userToken: login.userToken,
            encryptionKey: login.encryptionKey,
            appId: completed.appId || tokens.appId || getCircleAppId(),
            refreshToken: login.refreshToken,
            chainId,
            method,
            challengeId: completed.challengeId,
            wallet: completed.wallet,
          })
        }

        throw new Error(`Unsupported Circle auth method: ${method}`)
      })
    },
    [accessToken, finishWithCredentials, withPending],
  )

  const switchChain = useCallback(
    async (chainId: number, opts?: { allowAddressChange?: boolean }) => {
      const current = sessionRef.current
      if (!current) throw new Error('Connect Circle Wallet first.')
      if (current.chainId === chainId) return
      const chain = getCircleSwitchChainById(chainId)
      if (!chain || !isCircleSupportedChainId(chainId)) {
        throw new WalletChainSwitchError(`Unsupported chain id ${chainId}.`, new Error('unsupported_chain'))
      }
      // Hop chains are never Fist login chains — only allow under fundingHop / explicit allow.
      if (!isCircleLoginChainId(chainId) && !opts?.allowAddressChange && !isFundingHopActiveFromStore()) {
        throw new WalletChainSwitchError(
          `Circle Wallet cannot switch to ${chain.name} outside a funding flow.`,
          new Error('circle_hop_locked'),
          false,
        )
      }
      const hasFistSession = isUsableApiAccessToken(accessToken)
      const allow =
        opts?.allowAddressChange === true ||
        isFundingHopActiveFromStore() ||
        !hasFistSession
      if (!allow) {
        throw new WalletChainSwitchError(
          `Circle Wallet uses a different address on ${chain.name}. Sign in again on that network to continue.`,
          new Error('circle_address_change'),
          false,
        )
      }
      await withPending(async () => {
        const live = await applyWallet(
          {
            userToken: current.userToken,
            encryptionKey: current.encryptionKey,
            appId: current.appId,
            refreshToken: current.refreshToken,
          },
          chainId,
          null,
          current.authMethod,
        )
        persist(live)
      })
    },
    [accessToken, applyWallet, persist, withPending],
  )

  const switchChainRef = useRef(switchChain)
  switchChainRef.current = switchChain

  useEffect(() => {
    let cancelled = false
    const settle = () => {
      if (!cancelled) setReady(true)
    }

    // Wait for redux-persist so accessToken / authChainId are real before restoring.
    if (!persistReady) {
      setReady(false)
      return () => {
        cancelled = true
      }
    }

    void (async () => {
      try {
        if (isLocalOnlyDeployMode()) {
          persist(null)
          return
        }
        if (!isCircleWalletEnabled()) return

        // Resume OAuth redirect (Google / Facebook / Apple)
        const socialPending = readCircleSocialPending()
        if (socialPending) {
          try {
            const login = await awaitCircleSocialLoginReturn({
              deviceToken: socialPending.deviceToken,
              deviceEncryptionKey: socialPending.deviceEncryptionKey,
              provider: socialPending.provider,
              redirectUri: socialPending.redirectUri,
            })
            if (cancelled) return
            writeCircleSocialPending(null)
            const completed = await postCircleAuthComplete({
              chainId: socialPending.chainId,
              userToken: login.userToken,
              authMethod: socialPending.provider,
              accessToken,
            })
            await finishWithCredentials({
              userToken: login.userToken,
              encryptionKey: login.encryptionKey,
              appId: completed.appId || getCircleAppId(),
              refreshToken: login.refreshToken,
              chainId: socialPending.chainId,
              method: socialPending.provider,
              challengeId: completed.challengeId,
              wallet: completed.wallet,
            })
            return
          } catch {
            writeCircleSocialPending(null)
          }
        }

        const ref = readCircleWalletRef()
        const secrets = readCircleSecrets()

        const healToAuthLoginChain = async (
          nextSecrets: {
            userToken: string
            encryptionKey: string
            appId: string
            refreshToken?: string | null
          },
          authMethod?: CircleAuthMethod | string | null,
        ) => {
          if (cancelled) return
          if (!isUsableApiAccessToken(accessToken) || authChainId == null) return
          if (!isCircleLoginChainId(authChainId)) return
          const live = sessionRef.current
          if (!live || live.chainId === authChainId) return
          try {
            await applyWallet(nextSecrets, authChainId, null, authMethod ?? live.authMethod)
          } catch (e) {
            if (import.meta.env.DEV) {
              console.warn('[CircleWallet] heal to auth chain failed; keeping current session', e)
            }
          }
        }

        if (isUsableApiAccessToken(accessToken) && accessToken) {
          try {
            const refreshed = await postCircleSessionRefresh({
              accessToken,
              chainId: authChainId ?? ref?.chainId ?? null,
            })
            if (cancelled) return
            const nextSecrets = {
              userToken: refreshed.userToken,
              encryptionKey: refreshed.encryptionKey,
              appId: refreshed.appId || getCircleAppId(),
              refreshToken: refreshed.refreshToken,
            }
            const preferredAuthChain =
              authChainId != null && isCircleLoginChainId(authChainId) ? authChainId : null
            const chainId =
              preferredAuthChain ??
              refreshed.wallet?.chainId ??
              authChainId ??
              ref?.chainId
            if (chainId == null) return
            const existing =
              refreshed.wallet &&
              Math.trunc(refreshed.wallet.chainId) === Math.trunc(chainId)
                ? refreshed.wallet
                : null
            await applyWallet(nextSecrets, chainId, existing, refreshed.authMethod)
            await healToAuthLoginChain(nextSecrets, refreshed.authMethod)
            return
          } catch {
            /* try Circle refreshToken or cached secrets */
          }
        }

        if (secrets?.refreshToken) {
          try {
            const refreshed = await postCircleUserTokenRefresh({
              userToken: secrets.userToken,
              refreshToken: secrets.refreshToken,
              accessToken,
            })
            if (cancelled) return
            const nextSecrets = {
              userToken: refreshed.userToken,
              encryptionKey: refreshed.encryptionKey || secrets.encryptionKey,
              appId: refreshed.appId || secrets.appId || getCircleAppId(),
              refreshToken: refreshed.refreshToken,
            }
            const preferredAuthChain =
              authChainId != null && isCircleLoginChainId(authChainId) ? authChainId : null
            const chainId = preferredAuthChain ?? ref?.chainId ?? authChainId
            if (chainId == null) return
            await applyWallet(nextSecrets, chainId, null)
            await healToAuthLoginChain(nextSecrets)
            return
          } catch {
            /* fall through */
          }
        }

        if (secrets && ref) {
          const bootChain =
            authChainId != null && isCircleLoginChainId(authChainId) ? authChainId : ref.chainId
          const existing =
            Math.trunc(ref.chainId) === Math.trunc(bootChain)
              ? {
                  walletId: ref.walletId,
                  address: ref.address,
                  chainId: ref.chainId,
                  accountType: 'EOA' as const,
                  blockchain: '',
                }
              : null
          await applyWallet(secrets, bootChain, existing)
          await healToAuthLoginChain(secrets)
        }
      } catch (e) {
        // Do not wipe an already-restored session on a later auth-token refresh failure.
        if (!sessionRef.current) {
          persist(null)
        } else if (import.meta.env.DEV) {
          console.warn('[CircleWallet] restore error with existing session kept', e)
        }
      } finally {
        settle()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [accessToken, applyWallet, authChainId, finishWithCredentials, persist, persistReady])

  const wallet = useMemo(() => {
    if (!session) return null
    return createCircleAppWallet({
      getSession: () => {
        const current = sessionRef.current
        if (!current) throw new Error('Circle Wallet is disconnected.')
        return current
      },
      switchChain: (chainId) =>
        switchChainRef.current(chainId, {
          // Provider-driven switches during CCTP set fundingHop; allowAddressChange
          // is also granted when fundingHop.active inside switchChain.
          allowAddressChange: isFundingHopActiveFromStore(),
        }),
      onDisconnect: disconnect,
    })
  }, [session, disconnect])

  const value = useMemo<CircleWalletContextValue>(
    () => ({
      ready,
      wallet,
      session,
      actionPending,
      connect,
      disconnect,
      switchChain,
    }),
    [ready, wallet, session, actionPending, connect, disconnect, switchChain],
  )

  return <CircleWalletContext.Provider value={value}>{children}</CircleWalletContext.Provider>
}

const DISABLED: CircleWalletContextValue = {
  ready: true,
  wallet: null,
  session: null,
  actionPending: false,
  connect: async () => {
    throw new Error(circleWalletUnavailableReason() || 'Circle Wallet is not available.')
  },
  disconnect: async () => {},
  switchChain: async () => {
    throw new Error('Circle Wallet is not connected.')
  },
}

export function useCircleWallet(): CircleWalletContextValue {
  return useContext(CircleWalletContext) ?? DISABLED
}
