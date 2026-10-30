import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'

import { isUsableApiAccessToken } from '@/auth/accessTokenPolicy'
import { getApiBaseUrl } from '@/api/client'
import { toAppUserFacingError } from '@/errors/toAppUserFacingError'
import { createWalletLoginSignable, postWalletLogin } from '@/api/walletSession'
import privyIcon from '@/assets/Icon (1).png'
import { isSafeDashboardReturnPath, resolveDashboardReturnTo, saveDashboardReturnTo } from '@/session/dashboardReturnTo'
import { applyWalletLoginResponse } from '@/session/loginBridge'
import { disconnectPrivySession } from '@/session/disconnectPrivySession'
import { consumeSessionEndMessage } from '@/session/sessionEnd'
import { logoutUserSession } from '@/session/logoutUserSession'
import { unlockAfterConnectWallet } from '@/state/session'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { persistor } from '@/store'
import { patchAuth } from '@/store/slices/authSlice'
import { resetWallet } from '@/store/slices/walletSlice'
import { setInvestorWalletDisplay } from '@/store/slices/investorDashboardSlice'
import { setMerchantWalletDisplay } from '@/store/slices/merchantDashboardSlice'
import { parseUserRole } from '@/utils/userRole'
import { useActiveWallet } from '@/wallet/useActiveWallet'
import { getAppChainById } from '@/wallet/appChain'
import { formatWalletChainSwitchError, isUserRejectedWalletRequest } from '@/wallet/walletChainErrors'
import {
  ensureWalletChain,
  getWalletClientFromPrivyWallet,
} from '@/wallet/viemClients'
import NetworkModeSwitcher, { selectedNetworkChain } from '@/components/session/NetworkModeSwitcher'

function truncateAddress(address: string) {
  if (address.length <= 12) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function isWalletSignRejected(e: unknown): boolean {
  return isUserRejectedWalletRequest(e)
}

interface ConnectWalletProps {
  onContinue?: () => void
}

export default function ConnectWallet({ onContinue }: ConnectWalletProps) {
  const dispatch = useAppDispatch()
  const roleFromStore = useAppSelector((s) => s.auth.role)
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const role = parseUserRole(roleFromStore)
  const location = useLocation()
  const navigate = useNavigate()

  const { ready: privyReady, login, connectWallet, logout, unlinkWallet } = usePrivy()
  const { wallet, address, isConnected, walletClientType, ready: walletsReady, setActiveWalletId } =
    useActiveWallet()
  const chainId = useAppSelector((s) => s.wallet.chainId)

  const [rowError, setRowError] = React.useState<string | null>(null)
  const [sessionEndBanner, setSessionEndBanner] = React.useState(false)
  const [authInFlight, setAuthInFlight] = React.useState(false)
  const [connecting, setConnecting] = React.useState(false)
  const [disconnecting, setDisconnecting] = React.useState(false)
  const [loggingOut, setLoggingOut] = React.useState(false)
  const [switchingNetwork, setSwitchingNetwork] = React.useState(false)
  const switchAttempt = React.useRef('')

  const selectedChain = selectedNetworkChain()

  React.useEffect(() => {
    if (!isConnected || !wallet || !walletsReady) {
      switchAttempt.current = ''
      return
    }
    if (chainId === selectedChain.id) {
      setSwitchingNetwork(false)
      return
    }
    const key = `${address ?? ''}:${selectedChain.id}`
    if (switchAttempt.current === key) return
    switchAttempt.current = key
    let cancelled = false
    setSwitchingNetwork(true)
    setRowError(null)
    void ensureWalletChain(wallet, selectedChain.id)
      .catch((e) => {
        if (!cancelled) setRowError(formatWalletChainSwitchError(e, selectedChain.name))
      })
      .finally(() => {
        if (!cancelled) setSwitchingNetwork(false)
      })
    return () => {
      cancelled = true
    }
  }, [address, chainId, isConnected, selectedChain.id, selectedChain.name, wallet, walletsReady])

  React.useLayoutEffect(() => {
    const from = (location.state as { from?: string } | null)?.from
    if (typeof from === 'string' && isSafeDashboardReturnPath(from)) {
      saveDashboardReturnTo(from)
    }
  }, [location.state])

  React.useEffect(() => {
    const message = consumeSessionEndMessage()
    if (message) {
      setRowError(message)
      setSessionEndBanner(true)
    }
  }, [])

  const handleFullLogout = () => {
    if (loggingOut) return
    setLoggingOut(true)
    void logoutUserSession(dispatch, wallet, logout, { unlinkWallet }).catch(() => {
      setLoggingOut(false)
    })
  }
  React.useEffect(() => {
    if (!isConnected || !address) return
    const display = truncateAddress(address)
    if (role === 'merchant') dispatch(setMerchantWalletDisplay(display))
    else dispatch(setInvestorWalletDisplay(display))
  }, [isConnected, address, dispatch, role])

  const handlePrivyLogin = async () => {
    setRowError(null)
    if (!privyReady) return
    setConnecting(true)
    try {
      await login()
    } catch (e) {
      setRowError(
        toAppUserFacingError(e, {
          fallback: 'Could not open login.',
          context: 'onboarding',
        }),
      )
      console.error(e)
    } finally {
      setConnecting(false)
    }
  }

  const handleConnectExternalWallet = async () => {
    setRowError(null)
    if (!privyReady) return
    if (typeof connectWallet !== 'function') {
      setRowError('External wallet connection is not available in this build.')
      return
    }
    setConnecting(true)
    try {
      await connectWallet()
    } catch (e) {
      setRowError(
        toAppUserFacingError(e, {
          fallback: 'Could not connect wallet.',
          context: 'onboarding',
        }),
      )
      console.error(e)
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnectWallet = async () => {
    setRowError(null)
    setDisconnecting(true)
    try {
      // External wallets stay in Privy's `useWallets()` until the Privy session ends.
      // Linked-only disconnect is a no-op for MetaMask — must call logout.
      setActiveWalletId(null)
      dispatch(resetWallet())
      dispatch(
        patchAuth({
          accessToken: null,
          refreshToken: null,
          sessionKind: null,
          wallet: null,
          chainId: null,
          authIssuedAt: null,
          sessionExpired: false,
          sessionExpiredReason: null,
        }),
      )
      await disconnectPrivySession(wallet, logout, { unlinkWallet })
      await persistor.flush()
    } catch (e) {
      setRowError(
        toAppUserFacingError(e, {
          fallback: 'Could not disconnect wallet.',
          context: 'onboarding',
        }),
      )
      console.error(e)
    } finally {
      setDisconnecting(false)
    }
  }

  const handleContinue = async () => {
    if (onContinue) return onContinue()

    if (!role) {
      setRowError('Choose investor or merchant on the previous step before signing in.')
      return
    }

    if (!getApiBaseUrl()) {
      setRowError(
        'API base URL is not configured. Set VITE_API_BASE_URL in your .env file (see .env.example) and restart the dev server.',
      )
      return
    }

    if (!walletsReady) return

    if (!wallet || !address) {
      setRowError('Connect a wallet first (embedded or external) to sign in.')
      return
    }

    setRowError(null)
    setAuthInFlight(true)
    try {
      const loginChain = selectedNetworkChain()
      try {
        await ensureWalletChain(wallet, loginChain.id)
      } catch (e) {
        if (isWalletSignRejected(e)) {
          setRowError(
            `Switch to ${loginChain.name} was cancelled. Approve the network change to sign in.`,
          )
          return
        }
        throw e
      }
      if (!getAppChainById(loginChain.id)) {
        setRowError(`Could not switch to ${loginChain.name}.`)
        return
      }

      const signable = createWalletLoginSignable(loginChain.id, address as `0x${string}`)
      const walletClient = await getWalletClientFromPrivyWallet(wallet, loginChain.id)
      const signature = await walletClient.signTypedData({
        domain: signable.domain,
        types: signable.types as any,
        primaryType: signable.primaryType,
        message: signable.message as any,
        account: address as `0x${string}`,
      })

      const loginRes = await postWalletLogin({
        signedMessage: signable.signedMessageForApi,
        signature,
        signerAddress: address,
        role,
        chainId: loginChain.id,
      })

      const sessionChainId = loginRes.chainId ?? loginChain.id
      const sessionWallet = loginRes.wallet ?? address
      setActiveWalletId(sessionWallet)

      const returningUser = loginRes.registered || loginRes.onboarded
      if (returningUser) {
        applyWalletLoginResponse(
          dispatch,
          {
            access_token: loginRes.accessToken,
            refresh_token: loginRes.refreshToken ?? null,
            registered: loginRes.registered,
            onboarded: loginRes.onboarded,
            kycStatus: loginRes.kycStatus,
            user: loginRes.user ?? undefined,
            role: loginRes.roleFromApi ?? undefined,
            chain_id: sessionChainId,
            wallet: sessionWallet,
          },
          { fallbackRole: role },
        )
        await persistor.flush()
        const effectiveRole = parseUserRole(loginRes.roleFromApi) ?? parseUserRole(role) ?? 'investor'
        navigate(resolveDashboardReturnTo(effectiveRole), { replace: true })
        return
      }

      dispatch(
        patchAuth({
          accessToken: loginRes.accessToken,
          refreshToken: loginRes.refreshToken ?? null,
          sessionKind: 'app',
          sessionExpired: false,
          sessionExpiredReason: null,
          chainId: sessionChainId,
          wallet: sessionWallet,
        }),
      )
      unlockAfterConnectWallet(role)
      await persistor.flush()

      // Embedded (email/Google) wallets must back up their private key before creating a profile.
      const isEmbedded = walletClientType === 'privy'
      const nextStep = isEmbedded ? 'secure-key' : 'verify-identity'

      if (location.pathname.startsWith('/onboarding/investor')) {
        navigate(`/onboarding/investor/${nextStep}`)
        return
      }

      if (location.pathname.startsWith('/onboarding/merchant')) {
        navigate(`/onboarding/merchant/${nextStep}`)
        return
      }
    } catch (e) {
      if (isWalletSignRejected(e)) {
        setRowError('Signature was cancelled. Please try again when you are ready to sign in.')
      } else {
        setRowError(
          toAppUserFacingError(e, {
            fallback: 'Could not complete wallet sign-in.',
            context: 'onboarding',
          }),
        )
      }
      console.error(e)
    } finally {
      setAuthInFlight(false)
    }
  }

  return (
    <div className="relative w-full flex justify-center lg:justify-start">
      <NetworkModeSwitcher className="fixed top-4 right-4 z-30 sm:top-5 sm:right-6" compact />
      <div className="w-full max-w-[560px] lg:max-w-none flex flex-col min-h-[520px] sm:min-h-[560px] lg:min-h-0">
        <div className="flex flex-col gap-2 mb-6 lg:mb-8">
          <h3 className="text-black font-bold text-[20px]">Connect Your Wallet</h3>
          <p className="text-[#6B7488]">
            Use email/Google to create an embedded wallet, or connect an external wallet (MetaMask, WalletConnect, Phantom EVM).
            Choose Testnet or Mainnet at the top right before signing in.
          </p>
        </div>

        {isConnected && address ? (
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[14px] text-[#195EBC] font-medium" aria-live="polite">
              Connected: <span className="font-mono">{truncateAddress(address)}</span>
              {walletClientType ? <span className="ml-2 text-[#6B7488]">({walletClientType})</span> : null}
            </p>
            <button
              type="button"
              onClick={() => void handleDisconnectWallet()}
              disabled={disconnecting || authInFlight || connecting}
              className="text-[14px] font-medium text-[#6B7488] underline underline-offset-2 hover:text-[#374151] disabled:opacity-60 self-start sm:self-auto"
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect wallet'}
            </button>
          </div>
        ) : null}

        {switchingNetwork ? (
          <p className="text-[14px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4" role="status">
            Switching your wallet to {selectedChain.name}…
          </p>
        ) : null}

        {rowError ? (
          <p className="text-[14px] text-red-600 mb-4 whitespace-pre-wrap" role="alert">
            {rowError}
          </p>
        ) : null}

        {sessionEndBanner || (role && !isUsableApiAccessToken(accessToken)) ? (
          <button
            type="button"
            onClick={handleFullLogout}
            disabled={loggingOut || authInFlight || connecting || disconnecting}
            className="mb-4 text-[14px] font-medium text-[#6B7488] underline underline-offset-2 hover:text-[#374151] disabled:opacity-60 self-start"
          >
            {loggingOut ? 'Logging out…' : 'Log out and disconnect wallet'}
          </button>
        ) : null}

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => void handlePrivyLogin()}
            disabled={connecting || authInFlight || disconnecting || !privyReady}
            className="flex items-center justify-between rounded-md border border-[#EAEAEA] bg-white px-4 py-3 hover:bg-[#F9FAFB] disabled:opacity-60"
          >
            <div className="flex items-center gap-3 min-w-0">
              <img src={privyIcon} alt="" className="inline-block w-[22px] h-[22px]" />
              <span className="text-black font-bold truncate">Continue with Google or email</span>
            </div>
            <span className="text-[14px] text-[#6B7488]">
              {!privyReady ? 'Loading…' : connecting ? 'Opening…' : 'Login'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => void handleConnectExternalWallet()}
            disabled={connecting || authInFlight || disconnecting || !privyReady}
            className="flex items-center justify-between rounded-md border border-[#EAEAEA] bg-white px-4 py-3 hover:bg-[#F9FAFB] disabled:opacity-60"
          >
            <span className="text-black font-bold truncate">Connect external wallet</span>
            <span className="text-[14px] text-[#6B7488]">
              {!privyReady ? 'Loading…' : connecting ? 'Opening…' : 'Connect'}
            </span>
          </button>
        </div>

        <div className="mt-auto lg:mt-6 pt-5 lg:pt-0">
          <button
            type="button"
            onClick={() => void handleContinue()}
            disabled={!isConnected || !walletsReady || authInFlight || disconnecting || switchingNetwork}
            className="bg-[#195EBC] text-white px-4 py-3 rounded-md w-full mt-1 disabled:opacity-60"
          >
            {authInFlight ? 'Signing in…' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
