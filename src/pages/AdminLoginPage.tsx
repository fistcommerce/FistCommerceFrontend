import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'

import { ApiRequestError, getApiBaseUrl } from '@/api/client'
import { postAdminWalletLogin } from '@/api/adminAuth'
import { createWalletLoginSignable } from '@/api/walletSession'
import privyIcon from '@/assets/Icon (1).png'
import { AdminLoginFeedbackModal } from '@/components/admin/AdminLoginFeedbackModal'
import AdminLoginGuard from '@/components/session/AdminLoginGuard'
import NetworkModeSwitcher from '@/components/session/NetworkModeSwitcher'
import { ADMIN_DASHBOARD_OVERVIEW_PATH } from '@/auth/adminSession'
import { toAppUserFacingError } from '@/errors/toAppUserFacingError'
import { consumeSessionEndMessage } from '@/session/sessionEnd'
import { useAppDispatch } from '@/store/hooks'
import { persistor } from '@/store'
import { patchAuth } from '@/store/slices/authSlice'
import { useActiveWallet } from '@/wallet/useActiveWallet'
import { getAppChainById, isSupportedAppChainId } from '@/wallet/appChain'
import { isUserRejectedWalletRequest } from '@/wallet/walletChainErrors'
import {
  getWalletClientFromPrivyWallet,
  readWalletProviderChainId,
} from '@/wallet/viemClients'
import { getUnsupportedNetworkMessage } from '@/contract_config/contractNetwork'

function truncateAddress(address: string) {
  if (address.length <= 12) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function isWalletSignRejected(e: unknown): boolean {
  return isUserRejectedWalletRequest(e)
}

function formatAdminLoginError(err: unknown): string {
  if (err instanceof ApiRequestError && err.status === 401) {
    return 'This wallet is not authorized as a multisig owner, or the signature was invalid. Connect with a multisig owner wallet and try again.'
  }
  return toAppUserFacingError(err, {
    fallback: 'Could not sign in. Please try again.',
    context: 'onboarding',
  })
}

const AdminLoginPage = () => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { ready: privyReady, login, connectWallet } = usePrivy()
  const { wallet, address, isConnected, walletClientType, ready: walletsReady, setActiveWalletId } =
    useActiveWallet({ includeCircle: false })

  const [connecting, setConnecting] = useState(false)
  const [authInFlight, setAuthInFlight] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const message = consumeSessionEndMessage()
    if (message) setErrorMessage(message)
  }, [])

  const handlePrivyLogin = async () => {
    setErrorMessage(null)
    if (!privyReady) {
      setErrorMessage('Login is still loading. Please try again in a moment.')
      return
    }
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
    if (!privyReady) {
      setErrorMessage('Wallet connection is still loading. Please try again in a moment.')
      return
    }
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

  const handleSignIn = async () => {
    if (!getApiBaseUrl()) {
      setErrorMessage(
        'API base URL is not configured. Set VITE_API_BASE_URL in your .env file (see .env.example) and restart the dev server.',
      )
      return
    }

    if (!walletsReady) {
      setErrorMessage('Wallet is still loading. Please wait a moment and try again.')
      return
    }

    if (!wallet || !address) {
      setErrorMessage('Connect a wallet first (embedded or external) to sign in.')
      return
    }

    setErrorMessage(null)
    setAuthInFlight(true)
    try {
      const providerChainId = await readWalletProviderChainId(wallet)
      const loginChainId = providerChainId
      if (loginChainId == null || !isSupportedAppChainId(loginChainId)) {
        setErrorMessage(getUnsupportedNetworkMessage())
        return
      }
      const loginChain = getAppChainById(loginChainId)
      if (!loginChain) {
        setErrorMessage(getUnsupportedNetworkMessage({ short: true }))
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
      if (isWalletSignRejected(e)) {
        setErrorMessage('Signature was cancelled. Please try again when you are ready to sign in.')
      } else {
        setErrorMessage(formatAdminLoginError(e))
      }
      console.error(e)
    } finally {
      setAuthInFlight(false)
    }
  }

  const busy = connecting || authInFlight

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
          Connect your multisig owner wallet to monitor, manage, and control platform operations.
          Use the Testnet / Mainnet control at the top right before signing in.
        </p>

        {isConnected && address ? (
          <p className="mt-8 text-center text-[14px] text-[#195EBC] font-medium" aria-live="polite">
            Connected: <span className="font-mono">{truncateAddress(address)}</span>
            {walletClientType ? <span className="ml-2 text-[#6B7280]">({walletClientType})</span> : null}
          </p>
        ) : null}

        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => void handlePrivyLogin()}
            disabled={busy}
            className="flex items-center justify-between rounded-xl border border-[#E5E7EB] bg-white px-5 py-4 text-left transition-[box-shadow,border-color] hover:bg-[#F9FAFB] focus:border-[#1D61C1]/50 focus:ring-2 focus:ring-[#1D61C1]/25 disabled:opacity-60 sm:rounded-2xl"
          >
            <div className="flex items-center gap-3 min-w-0">
              <img src={privyIcon} alt="" className="inline-block w-[22px] h-[22px]" />
              <span className="text-[#2B2F36] font-semibold truncate">Continue with Google or email</span>
            </div>
            <span className="text-[14px] text-[#6B7280] shrink-0">{connecting ? 'Opening…' : 'Login'}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleConnectExternalWallet()}
            disabled={busy}
            className="flex items-center justify-between rounded-xl border border-[#E5E7EB] bg-white px-5 py-4 text-left transition-[box-shadow,border-color] hover:bg-[#F9FAFB] focus:border-[#1D61C1]/50 focus:ring-2 focus:ring-[#1D61C1]/25 disabled:opacity-60 sm:rounded-2xl"
          >
            <span className="text-[#2B2F36] font-semibold truncate">Connect external wallet</span>
            <span className="text-[14px] text-[#6B7280] shrink-0">{connecting ? 'Opening…' : 'Connect'}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => void handleSignIn()}
          disabled={!isConnected || busy}
          className="mt-8 w-full rounded-xl bg-[#1D61C1] py-4 text-base font-semibold text-white shadow-md shadow-[#1D61C1]/25 transition-[background-color,transform,box-shadow] hover:bg-[#1955AD] hover:shadow-lg hover:shadow-[#1D61C1]/30 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed sm:rounded-2xl sm:py-4.5"
        >
          {authInFlight ? 'Signing in…' : 'Sign In'}
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
