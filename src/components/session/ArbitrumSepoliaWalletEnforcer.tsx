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
import { MAINNET_CHAIN_ID, TESTNET_CHAIN_ID, getUnsupportedNetworkMessage } from '@/contract_config/contractNetwork'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { store } from '@/store'
import { resetWallet } from '@/store/slices/walletSlice'
import { parseUserRole } from '@/utils/userRole'
import {
  getAppChainById,
  getSupportedAppChains,
  isSupportedAppChainId,
  MAINNET_CHAIN,
  TESTNET_CHAIN,
} from '@/wallet/appChain'
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
 * Supported: Arbitrum One + Arbitrum Sepolia (or local-only when env is local).
 * Does not auto-switch between supported chains.
 */
export default function ArbitrumSepoliaWalletEnforcer() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const role = useAppSelector((s) => s.auth.role)
  const { ready: privyReady, logout, unlinkWallet } = usePrivy()
  const { wallet, isConnected, address, ready: walletsReady } = useActiveWallet()
  const chainId = useAppSelector((s) => s.wallet.chainId)
  const [switchError, setSwitchError] = useState<string | null>(null)
  const [switchingTarget, setSwitchingTarget] = useState<number | null>(null)
  const [choosingWallet, setChoosingWallet] = useState(false)

  const skipEnforcer = isOnboardingConnectWalletPath(pathname)
  const supported = getSupportedAppChains()
  const dualDeployed =
    supported.some((c) => c.id === MAINNET_CHAIN_ID) &&
    supported.some((c) => c.id === TESTNET_CHAIN_ID)

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
    !isSupportedAppChainId(chainId)

  const showBlockingModal = wrongNetwork && !skipEnforcer
  const switching = switchingTarget != null

  useEffect(() => {
    if (!wrongNetwork || skipEnforcer) {
      setSwitchError(null)
      setSwitchingTarget(null)
    }
  }, [wrongNetwork, skipEnforcer])

  const handleLogoutWrongNetwork = useCallback(async () => {
    await disconnectPrivySession(wallet, logout, { unlinkWallet })
    const { accessToken, sessionKind } = store.getState().auth
    const currentPathname = typeof window !== 'undefined' ? window.location.pathname : undefined
    const toAdminLogin = shouldRedirectToAdminLogin({
      accessToken,
      sessionKind,
      pathname: currentPathname,
    })
    resetUserSession(dispatch)
    window.location.replace(toAdminLogin ? ADMIN_LOGIN_PATH : '/onboarding/choose-role')
  }, [wallet, logout, unlinkWallet, dispatch])

  const handleChooseDifferentWallet = useCallback(async () => {
    if (choosingWallet) return
    setChoosingWallet(true)
    try {
      // Must end Privy session — linked-only disconnect leaves MetaMask in useWallets().
      await disconnectLinkedWalletOnly(wallet, { logout, unlinkWallet })
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
  }, [choosingWallet, wallet, logout, unlinkWallet, dispatch, role, navigate])

  const primaryChain = dualDeployed ? MAINNET_CHAIN : supported[0]
  const secondaryChain = dualDeployed ? TESTNET_CHAIN : null

  const modalMessage = switchError
    ? switchError
    : dualDeployed
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
      {dualDeployed ? (
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
