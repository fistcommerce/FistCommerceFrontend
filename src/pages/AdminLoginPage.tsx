import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'

import { ApiRequestError, getApiBaseUrl } from '@/api/client'
import { postAdminWalletLogin } from '@/api/adminAuth'
import { createWalletLoginSignable } from '@/api/walletSession'
import privyIcon from '@/assets/Icon (1).png'
import { AdminLoginFeedbackModal } from '@/components/admin/AdminLoginFeedbackModal'
import AdminLoginGuard from '@/components/session/AdminLoginGuard'
import NetworkModeSwitcher, { selectedLoginNetwork, selectedNetworkChain } from '@/components/session/NetworkModeSwitcher'
import { ADMIN_DASHBOARD_OVERVIEW_PATH } from '@/auth/adminSession'
import { toAppUserFacingError } from '@/errors/toAppUserFacingError'
import { useIsStellarTestnetMode } from '@/hooks/usePreferredAppNetwork'
import { consumeSessionEndMessage } from '@/session/sessionEnd'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { persistor } from '@/store'
import { patchAuth } from '@/store/slices/authSlice'
import { resetWallet, setWalletFromProvider } from '@/store/slices/walletSlice'
import { STELLAR_TESTNET_CHAIN_ID } from '@/stellar/chain'
import {
  connectStellarWalletViaKit,
  disconnectStellarWalletKit,
  signStellarLoginMessage,
} from '@/stellar/walletsKit'
import { useActiveWallet } from '@/wallet/useActiveWallet'
import { getAppChainById } from '@/wallet/appChain'
import { isUserRejectedWalletRequest } from '@/wallet/walletChainErrors'
import { ensureWalletChain, getWalletClientFromPrivyWallet } from '@/wallet/viemClients'

function truncateAddress(address: string) {
  if (address.length <= 12) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatAdminLoginError(err: unknown): string {
  if (err instanceof ApiRequestError && err.status === 401) {
    return 'This wallet is not authorized as an admin signer, or the signature was invalid. Connect with an authorized admin wallet and try again.'
  }
  return toAppUserFacingError(err, {
    fallback: 'Could not sign in. Please try again.',
    context: 'onboarding',
  })
}

const AdminLoginPage = () => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const stellarMode = useIsStellarTestnetMode()
  const loginNetwork = selectedLoginNetwork()
  const { ready: privyReady, login, connectWallet } = usePrivy()
  const {
    wallet,
    address: evmAddress,
    isConnected: evmConnected,
    walletClientType,
    ready: walletsReady,
    setActiveWalletId,
  } = useActiveWallet()
  const reduxAddress = useAppSelector((s) => s.wallet.address)
  const reduxConnected = useAppSelector((s) => s.wallet.isConnected)
  const reduxConnector = useAppSelector((s) => s.wallet.connector)

  const address = stellarMode
    ? reduxConnector === 'stellar'
      ? reduxAddress
      : null
    : evmAddress
  const isConnected = stellarMode
    ? Boolean(reduxConnector === 'stellar' && reduxConnected && reduxAddress)
    : evmConnected

  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [authInFlight, setAuthInFlight] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const message = consumeSessionEndMessage({ isAdmin: true })
    if (message) setErrorMessage(message)
  }, [])

  const handlePrivyLogin = async () => {
    setErrorMessage(null)
    if (!privyReady) return
    setConnecting(true)
    try {
      await login()
    } catch (e) {
      setErrorMessage(
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
    setErrorMessage(null)
    if (!privyReady) return
    if (typeof connectWallet !== 'function') {
      setErrorMessage('External wallet connection is not available in this build.')
      return
    }
    setConnecting(true)
    try {
      await connectWallet()
    } catch (e) {
      setErrorMessage(
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

  const handleConnectStellarWallet = async () => {
    setErrorMessage(null)
    setConnecting(true)
    try {
      // Always disconnect kit session first so the modal can pick another wallet/account.
      dispatch(resetWallet())
      const { address: stellarAddress } = await connectStellarWalletViaKit({ forceReselect: true })
      dispatch(
        setWalletFromProvider({
          isConnected: true,
          address: stellarAddress,
          chainId: STELLAR_TESTNET_CHAIN_ID,
          connector: 'stellar',
        }),
      )
      setActiveWalletId(stellarAddress)
    } catch (e) {
      setErrorMessage(
        toAppUserFacingError(e, {
          fallback: 'Could not connect Stellar wallet.',
          context: 'onboarding',
        }),
      )
      console.error(e)
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnectWallet = async () => {
    setErrorMessage(null)
    setDisconnecting(true)
    try {
      setActiveWalletId(null)
      dispatch(resetWallet())
      if (stellarMode || reduxConnector === 'stellar') {
        await disconnectStellarWalletKit()
      }
      await persistor.flush()
    } catch (e) {
      setErrorMessage(
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

  const handleSignIn = async () => {
    if (!getApiBaseUrl()) {
      setErrorMessage(
        'API base URL is not configured. Set VITE_API_BASE_URL in your .env file (see .env.example) and restart the dev server.',
      )
      return
    }

    if (!isConnected || !address) {
      setErrorMessage(
        stellarMode
          ? 'Connect a Stellar wallet first (Varial/Freighter or Albedo) to sign in.'
          : 'Connect a wallet first (embedded or external) to sign in.',
      )
      return
    }

    setErrorMessage(null)
    setAuthInFlight(true)
    try {
      if (stellarMode) {
        const signable = createWalletLoginSignable(STELLAR_TESTNET_CHAIN_ID, address)
        const { signature } = await signStellarLoginMessage({
          wallet: address,
          issuedAt: signable.signedMessageForApi.issuedAt,
          action: signable.signedMessageForApi.action,
          nonce: signable.signedMessageForApi.nonce,
          chainId: STELLAR_TESTNET_CHAIN_ID,
        })

        const result = await postAdminWalletLogin({
          signedMessage: signable.signedMessageForApi,
          signature,
          signerAddress: address,
          chainId: STELLAR_TESTNET_CHAIN_ID,
        })

        const sessionWallet = result.wallet ?? address
        dispatch(
          patchAuth({
            onboarded: true,
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            role: null,
            sessionKind: 'admin',
            sessionExpired: false,
            sessionExpiredReason: null,
            user: { id: sessionWallet },
            chainId: result.chainId ?? STELLAR_TESTNET_CHAIN_ID,
            wallet: sessionWallet,
          }),
        )
        dispatch(
          setWalletFromProvider({
            isConnected: true,
            address: sessionWallet,
            chainId: STELLAR_TESTNET_CHAIN_ID,
            connector: 'stellar',
          }),
        )
        setActiveWalletId(sessionWallet)
        await persistor.flush()
        navigate(ADMIN_DASHBOARD_OVERVIEW_PATH, { replace: true })
        return
      }

      if (!walletsReady || !wallet) {
        setErrorMessage('Connect a wallet first (embedded or external) to sign in.')
        return
      }

      const loginChain = selectedNetworkChain()
      try {
        await ensureWalletChain(wallet, loginChain.id)
      } catch (e) {
        if (isUserRejectedWalletRequest(e)) {
          setErrorMessage(
            `Switch to ${loginChain.name} was cancelled. Approve the network change to sign in.`,
          )
          return
        }
        throw e
      }
      if (!getAppChainById(loginChain.id)) {
        setErrorMessage(`Could not switch to ${loginChain.name}.`)
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

      const result = await postAdminWalletLogin({
        signedMessage: signable.signedMessageForApi,
        signature,
        signerAddress: address,
        chainId: loginChain.id,
      })

      const sessionWallet = result.wallet ?? address
      dispatch(
        patchAuth({
          onboarded: true,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          role: null,
          sessionKind: 'admin',
          sessionExpired: false,
          sessionExpiredReason: null,
          user: { id: address },
          chainId: result.chainId ?? loginChain.id,
          wallet: sessionWallet,
        }),
      )
      setActiveWalletId(sessionWallet)
      await persistor.flush()
      navigate(ADMIN_DASHBOARD_OVERVIEW_PATH, { replace: true })
    } catch (e) {
      if (isUserRejectedWalletRequest(e)) {
        setErrorMessage('Signature was cancelled. Please try again when you are ready to sign in.')
      } else {
        setErrorMessage(formatAdminLoginError(e))
      }
      console.error(e)
    } finally {
      setAuthInFlight(false)
    }
  }

  const busy = connecting || disconnecting || authInFlight
  const signInDisabled = stellarMode
    ? !isConnected || busy
    : !isConnected || !walletsReady || busy

  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      <AdminLoginGuard />
      <NetworkModeSwitcher className="fixed top-4 right-4 z-30 sm:top-6 sm:right-6" />
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="isolate absolute inset-0">
          <div className="absolute inset-0 bg-linear-to-br from-[#EEF1F7] via-[#FAFBFD] to-[#E2E8F3]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_70%_at_50%_-15%,rgba(184,206,240,0.55),transparent_58%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_55%_at_100%_100%,rgba(200,214,236,0.4),transparent_50%)]" />
          <div className="absolute -top-[22%] -right-[12%] h-[min(78vmin,560px)] w-[min(78vmin,560px)] rounded-full bg-[#6B93DB]/38 blur-[96px]" />
          <div className="absolute -top-[5%] right-[8%] h-[min(42vmin,320px)] w-[min(42vmin,320px)] rounded-full bg-[#1D61C1]/14 blur-[72px]" />
          <div className="absolute -bottom-[28%] -left-[18%] h-[min(72vmin,540px)] w-[min(72vmin,540px)] rounded-full bg-[#A8BEE3]/42 blur-[88px]" />
          <div className="absolute -bottom-[8%] left-[5%] h-[min(48vmin,380px)] w-[min(48vmin,380px)] rounded-full bg-[#8FA8D4]/22 blur-[80px]" />
          <div className="absolute top-[32%] -left-[20%] h-[min(55vmin,420px)] w-[min(55vmin,420px)] rounded-full bg-[#C5CBD8]/55 blur-[90px]" />
          <div className="absolute bottom-[12%] right-[12%] h-[min(44vmin,340px)] w-[min(44vmin,340px)] rounded-full bg-[#B4B9C5]/40 blur-[76px]" />
          <div className="absolute left-1/2 top-1/2 h-[min(90vmin,640px)] w-[min(90vmin,640px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#D8DEE8]/35 blur-[110px]" />
        </div>
        <div className="absolute inset-0 bg-slate-950/10" />
      </div>

      <div className="relative z-10 w-full max-w-[520px] rounded-3xl bg-white px-10 py-12 shadow-[0_32px_90px_-24px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.08)] ring-1 ring-white/20 sm:px-12 sm:py-14">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-[#2B2F36] sm:text-[28px] sm:leading-tight">
          Sign In
        </h1>
        <p className="mt-3 text-center text-[15px] leading-relaxed text-[#6B7280] sm:text-base">
          Connect your admin wallet to monitor, manage, and control platform operations. Use the
          Testnet / Mainnet / Stellar control at the top right before signing in.
        </p>

        {isConnected && address ? (
          <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-center text-[14px] text-[#195EBC] font-medium sm:text-left" aria-live="polite">
              Connected: <span className="font-mono">{truncateAddress(address)}</span>
              {stellarMode ? (
                <span className="ml-2 text-[#6B7280]">(stellar)</span>
              ) : walletClientType ? (
                <span className="ml-2 text-[#6B7280]">({walletClientType})</span>
              ) : null}
            </p>
            <button
              type="button"
              onClick={() => void handleDisconnectWallet()}
              disabled={busy}
              className="text-[14px] font-medium text-[#6B7280] underline underline-offset-2 hover:text-[#374151] disabled:opacity-60 self-center sm:self-auto"
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        ) : null}

        <div className="mt-8 flex flex-col gap-3">
          {stellarMode ? (
            <button
              type="button"
              onClick={() => void handleConnectStellarWallet()}
              disabled={busy}
              className="flex items-center justify-between rounded-xl border border-[#E5E7EB] bg-white px-5 py-4 text-left transition-[box-shadow,border-color] hover:bg-[#F9FAFB] focus:border-[#1D61C1]/50 focus:ring-2 focus:ring-[#1D61C1]/25 disabled:opacity-60 sm:rounded-2xl"
            >
              <span className="text-[#2B2F36] font-semibold truncate">Connect Stellar wallet</span>
              <span className="text-[14px] text-[#6B7280] shrink-0">
                {connecting ? 'Opening…' : isConnected ? 'Switch' : 'Connect'}
              </span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void handlePrivyLogin()}
                disabled={busy || !privyReady}
                className="flex items-center justify-between rounded-xl border border-[#E5E7EB] bg-white px-5 py-4 text-left transition-[box-shadow,border-color] hover:bg-[#F9FAFB] focus:border-[#1D61C1]/50 focus:ring-2 focus:ring-[#1D61C1]/25 disabled:opacity-60 sm:rounded-2xl"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img src={privyIcon} alt="" className="inline-block w-[22px] h-[22px]" />
                  <span className="text-[#2B2F36] font-semibold truncate">Continue with Google or email</span>
                </div>
                <span className="text-[14px] text-[#6B7280] shrink-0">
                  {!privyReady ? 'Loading…' : connecting ? 'Opening…' : 'Login'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => void handleConnectExternalWallet()}
                disabled={busy || !privyReady}
                className="flex items-center justify-between rounded-xl border border-[#E5E7EB] bg-white px-5 py-4 text-left transition-[box-shadow,border-color] hover:bg-[#F9FAFB] focus:border-[#1D61C1]/50 focus:ring-2 focus:ring-[#1D61C1]/25 disabled:opacity-60 sm:rounded-2xl"
              >
                <span className="text-[#2B2F36] font-semibold truncate">Connect external wallet</span>
                <span className="text-[14px] text-[#6B7280] shrink-0">
                  {!privyReady ? 'Loading…' : connecting ? 'Opening…' : 'Connect'}
                </span>
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => void handleSignIn()}
          disabled={signInDisabled}
          className="mt-8 w-full rounded-xl bg-[#1D61C1] py-4 text-base font-semibold text-white shadow-md shadow-[#1D61C1]/25 transition-[background-color,transform,box-shadow] hover:bg-[#1955AD] hover:shadow-lg hover:shadow-[#1D61C1]/30 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed sm:rounded-2xl sm:py-4.5"
        >
          {authInFlight ? 'Signing in…' : `Sign In on ${loginNetwork.name}`}
        </button>
      </div>

      {errorMessage ? (
        <AdminLoginFeedbackModal
          open
          variant="error"
          title="Unable to sign in"
          description={errorMessage}
          primaryLabel="Try again"
          onPrimary={() => setErrorMessage(null)}
        />
      ) : null}
    </div>
  )
}

export default AdminLoginPage
