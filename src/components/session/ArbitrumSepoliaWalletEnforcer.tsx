import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'

import {
  isOnboardingConnectWalletPath,
  onboardingConnectWalletPath,
} from '@/access/onboardingPaths'
import DashboardErrorModal from '@/components/dashboard/shared/DashboardErrorModal'
import WrongNetworkHelp from '@/components/session/WrongNetworkHelp'
import { disconnectLinkedWalletOnly, disconnectPrivySession } from '@/session/disconnectPrivySession'
import { resetUserSession } from '@/session/resetUserSession'
import { ADMIN_LOGIN_PATH, shouldRedirectToAdminLogin } from '@/auth/adminSession'
import { getUnsupportedNetworkMessage } from '@/contract_config/contractNetwork'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { store } from '@/store'
import { resetWallet } from '@/store/slices/walletSlice'
import { parseUserRole } from '@/utils/userRole'
import {
  getAppChainById,
  getSupportedAppChains,
  isSupportedAppChainId,
} from '@/wallet/appChain'
import { isWalletSessionBusy } from '@/wallet/sessionBusy'
import { useActiveWallet } from '@/wallet/useActiveWallet'
import { formatWalletChainSwitchError } from '@/wallet/walletChainErrors'
import { ensureWalletChain } from '@/wallet/viemClients'

function logEnsureWalletChainFailure(
  context: string,
  err: unknown,
  extra: Record<string, unknown>,
) {
  const e = err as { message?: unknown; code?: unknown; name?: unknown; data?: unknown }
  console.error(`[SupportedChainsWalletEnforcer] ensureWalletChain failed (${context})`, {
    message: e?.message,
    code: e?.code,
    name: e?.name,
    data: e?.data,
    reduxChainId: store.getState().wallet.chainId,
    ...extra,
    err,
  })
}

/**
 * Blocks the app when the wallet is on an unsupported chain.
 * Supported: Arbitrum One, Arbitrum Sepolia, and Arc Testnet (or local-only when env is local).
 * Does not auto-switch between supported chains.
 */
export default function ArbitrumSepoliaWalletEnforcer() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const role = useAppSelector((s) => s.auth.role)
  const { ready: privyReady, logout } = usePrivy()
  const { wallet, isConnected, address, ready: walletsReady } = useActiveWallet()
  const chainId = useAppSelector((s) => s.wallet.chainId)
  const writePending = useAppSelector((s) => s.wallet.writePending)
  const actionPending = useAppSelector((s) => s.wallet.actionPending)
  const fundingHop = useAppSelector((s) => s.wallet.fundingHop)
  const sessionBusy = isWalletSessionBusy({ writePending, actionPending, fundingHop })
  const [switchError, setSwitchError] = useState<string | null>(null)
  const [switchingTarget, setSwitchingTarget] = useState<number | null>(null)
  const [choosingWallet, setChoosingWallet] = useState(false)

  const skipEnforcer = isOnboardingConnectWalletPath(pathname)
  const supported = getSupportedAppChains()
  const multiChain = supported.length > 1

  const runEnsureWalletChain = useCallback(
    async (targetChainId: number, context: string) => {
      if (!wallet) return
      const target = getAppChainById(targetChainId)
      if (!target) return
      setSwitchingTarget(targetChainId)
      try {
        await ensureWalletChain(wallet, targetChainId)
        setSwitchError(null)
        if (import.meta.env.DEV) {
          console.log(`[SupportedChainsWalletEnforcer] ensureWalletChain (${context}) OK`, {
            targetChainId,
            reduxChainIdAfter: store.getState().wallet.chainId,
          })
        }
      } catch (err) {
        logEnsureWalletChainFailure(context, err, {
          targetChainId,
          walletClientType: wallet.walletClientType,
          addressPreview: wallet.address ? `${wallet.address.slice(0, 8)}…` : null,
        })
        setSwitchError(formatWalletChainSwitchError(err, target.name))
      } finally {
        setSwitchingTarget(null)
      }
    },
    [wallet],
  )

  const wrongNetwork =
    privyReady &&
    walletsReady &&
    isConnected &&
    Boolean(address) &&
    chainId != null &&
    !isSupportedAppChainId(chainId) &&
    // Allow temporary CCTP hop chains while bridge/deposit/repay is in flight.
    !sessionBusy

  const showBlockingModal = wrongNetwork && !skipEnforcer
  const switching = switchingTarget != null

  useEffect(() => {
    if (!wrongNetwork || skipEnforcer) {
      setSwitchError(null)
      setSwitchingTarget(null)
    }
  }, [wrongNetwork, skipEnforcer])

  const handleLogoutWrongNetwork = useCallback(async () => {
    await disconnectPrivySession(wallet, logout)
    const { accessToken, sessionKind } = store.getState().auth
    const currentPathname = typeof window !== 'undefined' ? window.location.pathname : undefined
    const toAdminLogin = shouldRedirectToAdminLogin({
      accessToken,
      sessionKind,
      pathname: currentPathname,
    })
    resetUserSession(dispatch)
    window.location.replace(toAdminLogin ? ADMIN_LOGIN_PATH : '/onboarding/choose-role')
  }, [wallet, logout, dispatch])

  const handleChooseDifferentWallet = useCallback(async () => {
    if (choosingWallet) return
    setChoosingWallet(true)
    try {
      await disconnectLinkedWalletOnly(wallet)
      dispatch(resetWallet())
      const parsedRole = parseUserRole(role)
      if (parsedRole) {
        navigate(onboardingConnectWalletPath(parsedRole), { replace: true })
        return
      }
      navigate('/onboarding/choose-role', { replace: true })
    } finally {
      setChoosingWallet(false)
    }
  }, [choosingWallet, wallet, dispatch, role, navigate])

  const primaryChain = supported[0]
  const secondaryChain = multiChain ? (supported[1] ?? null) : null
  const extraChains = multiChain ? supported.slice(2) : []

  const modalMessage = switchError
    ? switchError
    : multiChain
      ? `${getUnsupportedNetworkMessage()} Choose a different wallet, or log out.`
      : `This app runs on ${primaryChain?.name ?? 'the app network'} only. Switch your wallet, choose a different wallet, or log out.`

  return (
    <DashboardErrorModal
      blocking
      open={showBlockingModal}
      title="Wrong network"
      message={modalMessage}
      retryLabel={
        switchingTarget === primaryChain?.id
          ? 'Switching…'
          : `Switch to ${primaryChain?.name ?? 'supported network'}`
      }
      retryDisabled={switching || choosingWallet || !primaryChain}
      onRetry={() => {
        if (!wallet || !primaryChain) return
        void runEnsureWalletChain(primaryChain.id, 'switchPrimary')
      }}
      tertiaryLabel={
        secondaryChain
          ? switchingTarget === secondaryChain.id
            ? 'Switching…'
            : `Switch to ${secondaryChain.name}`
          : choosingWallet
            ? 'Opening wallet picker…'
            : 'Choose a different wallet'
      }
      onTertiary={() => {
        if (secondaryChain) {
          if (!wallet) return
          void runEnsureWalletChain(secondaryChain.id, 'switchSecondary')
          return
        }
        void handleChooseDifferentWallet()
      }}
      secondaryLabel="Log out"
      onSecondary={() => void handleLogoutWrongNetwork()}
      onClose={() => {}}
    >
      {extraChains.map((chain) => (
        <button
          key={chain.id}
          type="button"
          disabled={switching || choosingWallet}
          onClick={() => {
            if (!wallet) return
            void runEnsureWalletChain(chain.id, `switchExtra-${chain.id}`)
          }}
          className="mt-3 w-full rounded-[6px] border border-[#E6E8EC] bg-white px-4 py-2.5 text-[14px] font-medium text-[#195EBC] hover:bg-[#F9FAFB] disabled:opacity-50"
        >
          {switchingTarget === chain.id ? 'Switching…' : `Switch to ${chain.name}`}
        </button>
      ))}
      {multiChain ? (
        <button
          type="button"
          disabled={switching || choosingWallet}
          onClick={() => void handleChooseDifferentWallet()}
          className="mt-3 w-full rounded-[6px] border border-[#E6E8EC] bg-white px-4 py-2.5 text-[14px] font-medium text-[#195EBC] hover:bg-[#F9FAFB] disabled:opacity-50"
        >
          {choosingWallet ? 'Opening wallet picker…' : 'Choose a different wallet'}
        </button>
      ) : null}
      <WrongNetworkHelp />
    </DashboardErrorModal>
  )
}
