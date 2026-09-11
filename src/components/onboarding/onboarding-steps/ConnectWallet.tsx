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
import { disconnectLinkedWalletOnly } from '@/session/disconnectPrivySession'
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
import { useCircleWallet } from '@/circle/CircleWalletProvider'
import { isCircleWalletEnabled } from '@/circle/enabled'
import type { CircleAuthMethod } from '@/circle/types'
import CircleConnectPanel from '@/components/onboarding/onboarding-steps/CircleConnectPanel'
import {
  ARC_TESTNET_CHAIN,
  MAINNET_CHAIN,
  TESTNET_CHAIN,
  getAppChainById,
  isSupportedAppChainId,
} from '@/wallet/appChain'
import { isUserRejectedWalletRequest } from '@/wallet/walletChainErrors'
import {
  getWalletClientFromPrivyWallet,
  readWalletProviderChainId,
} from '@/wallet/viemClients'
import NetworkModeSwitcher, { readPreferredNetwork } from '@/components/session/NetworkModeSwitcher'
import { getUnsupportedNetworkMessage } from '@/contract_config/contractNetwork'

function truncateAddress(address: string) {
  if (address.length <= 12) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function preferredConnectChainId(walletChainId: number | null | undefined): number {
  if (walletChainId != null && isSupportedAppChainId(walletChainId)) return walletChainId
  const preferred = readPreferredNetwork()
  if (preferred === 'mainnet') return MAINNET_CHAIN.id
  if (preferred === 'arc-testnet') return ARC_TESTNET_CHAIN.id
  return TESTNET_CHAIN.id
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

  const { ready: privyReady, login, connectWallet, logout } = usePrivy()
  const { wallet, address, isConnected, walletClientType, source, ready: walletsReady, setActiveWalletId } =
    useActiveWallet()
  const circle = useCircleWallet()
  const showCircleOption = isCircleWalletEnabled()
  const chainId = useAppSelector((s) => s.wallet.chainId)

  const [rowError, setRowError] = React.useState<string | null>(null)
  const [sessionEndBanner, setSessionEndBanner] = React.useState(false)
  const [authInFlight, setAuthInFlight] = React.useState(false)
  const [connecting, setConnecting] = React.useState(false)
  const [disconnecting, setDisconnecting] = React.useState(false)
  const [loggingOut, setLoggingOut] = React.useState(false)
  const [circlePanelOpen, setCirclePanelOpen] = React.useState(false)
  const [circleConnectingMethod, setCircleConnectingMethod] = React.useState<CircleAuthMethod | null>(
    null,
  )

  const wrongNetwork =
    isConnected && chainId != null && !isSupportedAppChainId(chainId)

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
    void logoutUserSession(dispatch, wallet, logout).catch(() => {
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
    if (!privyReady) {
      setRowError('Login is still loading. Please try again in a moment.')
      return
    }
    setConnecting(true)
    try {
      if (source === 'circle') {
        await circle.disconnect()
        setActiveWalletId(null)
        dispatch(resetWallet())
      }
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
    if (!privyReady) {
      setRowError('Wallet connection is still loading. Please try again in a moment.')
      return
    }
    if (typeof connectWallet !== 'function') {
      setRowError('External wallet connection is not available in this build.')
      return
    }
    setConnecting(true)
    try {
      if (source === 'circle') {
        await circle.disconnect()
        setActiveWalletId(null)
        dispatch(resetWallet())
      }
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

  const handleConnectCircleWallet = async (
    method: CircleAuthMethod,
    options?: { email?: string; pinUserId?: string },
  ) => {
    setRowError(null)
    setConnecting(true)
    setCircleConnectingMethod(method)
    try {
      if (source === 'privy' && wallet) {
        await disconnectLinkedWalletOnly(wallet)
        setActiveWalletId(null)
        dispatch(resetWallet())
      }
      const connected = await circle.connect(preferredConnectChainId(chainId), method, {
        email: options?.email,
        pinUserId: options?.pinUserId,
      })
      setActiveWalletId(connected.address)
      setCirclePanelOpen(false)
    } catch (e) {
      setRowError(
        toAppUserFacingError(e, {
          fallback: 'Could not connect Circle Wallet.',
          context: 'onboarding',
        }),
      )
      console.error(e)
    } finally {
      setConnecting(false)
      setCircleConnectingMethod(null)
    }
  }

  const handleDisconnectWallet = async () => {
    setRowError(null)
    setDisconnecting(true)
    try {
      await disconnectLinkedWalletOnly(wallet)
      setActiveWalletId(null)
      dispatch(resetWallet())
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

    if (!walletsReady) {
      setRowError('Wallet is still loading. Please wait a moment and try again.')
      return
    }

    if (!wallet || !address) {
      setRowError('Connect a wallet first (embedded or external) to sign in.')
      return
    }

    setRowError(null)
    setAuthInFlight(true)
    try {
      const providerChainId = await readWalletProviderChainId(wallet)
      const loginChainId = providerChainId ?? chainId
      if (loginChainId == null || !isSupportedAppChainId(loginChainId)) {
        setRowError(getUnsupportedNetworkMessage())
        return
      }
      const loginChain = getAppChainById(loginChainId)
      if (!loginChain) {
        setRowError(getUnsupportedNetworkMessage({ short: true }))
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
            Create an embedded wallet, connect a browser wallet, or use Circle. Network is chosen at the
            top right — Arc, Sepolia, and Mainnet use different Circle addresses.
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

        {wrongNetwork ? (
          <p className="text-[14px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4" role="status">
            {getUnsupportedNetworkMessage()} Then press Continue — or disconnect and choose another wallet.
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
            disabled={connecting || authInFlight || disconnecting}
            className="flex items-center justify-between rounded-md border border-[#EAEAEA] bg-white px-4 py-3 hover:bg-[#F9FAFB] disabled:opacity-60"
          >
            <div className="flex items-center gap-3 min-w-0">
              <img src={privyIcon} alt="" className="inline-block w-[22px] h-[22px]" />
              <span className="text-black font-bold truncate">Continue with Google or email</span>
            </div>
            <span className="text-[14px] text-[#6B7488]">{connecting ? 'Opening…' : 'Login'}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleConnectExternalWallet()}
            disabled={connecting || authInFlight || disconnecting}
            className="flex items-center justify-between rounded-md border border-[#EAEAEA] bg-white px-4 py-3 hover:bg-[#F9FAFB] disabled:opacity-60"
          >
            <span className="text-black font-bold truncate">Connect external wallet</span>
            <span className="text-[14px] text-[#6B7488]">{connecting ? 'Opening…' : 'Connect'}</span>
          </button>

          {showCircleOption ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setCirclePanelOpen((v) => !v)}
                disabled={connecting || authInFlight || disconnecting || circle.actionPending}
                aria-expanded={circlePanelOpen}
                className="flex items-center justify-between rounded-md border border-[#EAEAEA] bg-white px-4 py-3 hover:bg-[#F9FAFB] disabled:opacity-60"
              >
                <div className="flex min-w-0 flex-col items-start gap-0.5">
                  <span className="text-black font-bold truncate">Connect Circle Wallet</span>
                  <span className="text-[12px] font-normal text-[#6B7488]">
                    Google, Apple, Facebook, email, or PIN
                  </span>
                </div>
                <span className="text-[14px] text-[#6B7488] shrink-0 ml-3">
                  {connecting || circle.actionPending
                    ? 'Opening…'
                    : circlePanelOpen
                      ? 'Close'
                      : 'Open'}
                </span>
              </button>
              {circlePanelOpen ? (
                <CircleConnectPanel
                  busy={connecting || authInFlight || disconnecting || circle.actionPending}
                  connectingMethod={circleConnectingMethod}
                  onConnect={(method, options) => void handleConnectCircleWallet(method, options)}
                />
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="mt-auto lg:mt-6 pt-5 lg:pt-0">
          <button
            type="button"
            onClick={() => void handleContinue()}
            disabled={!isConnected || authInFlight || disconnecting || circle.actionPending}
            className="bg-[#195EBC] text-white px-4 py-3 rounded-md w-full mt-1 disabled:opacity-60"
          >
            {authInFlight ? 'Signing in…' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
