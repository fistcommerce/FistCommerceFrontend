import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { getUnsupportedNetworkMessage, isLocalOnlyDeployMode } from '@/contract_config/contractNetwork'
import { useIsStellarTestnetMode, usePreferredAppNetwork } from '@/hooks/usePreferredAppNetwork'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { store } from '@/store'
import { resetWallet } from '@/store/slices/walletSlice'
import { parseUserRole } from '@/utils/userRole'
import {
  getAppChainById,
  isSupportedAppChainId,
  MAINNET_CHAIN,
  TESTNET_CHAIN,
} from '@/wallet/appChain'
import type { Chain } from 'viem'
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
 * Keeps the EVM wallet on the correct app chain.
 *
 * Target priority:
 * 1. Logged-in session `auth.chainId` when it is a supported app chain
 * 2. Preferred Testnet / Mainnet from the network switcher
 *
 * Auto-switches when mismatched; only blocks with a modal if the switch fails
 * or the user rejects the wallet prompt.
 */
export default function ArbitrumSepoliaWalletEnforcer() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const role = useAppSelector((s) => s.auth.role)
  const authChainId = useAppSelector((s) => s.auth.chainId)
  const preferred = usePreferredAppNetwork()
  const { ready: privyReady, logout, unlinkWallet } = usePrivy()
  const { wallet, isConnected, address, ready: walletsReady } = useActiveWallet()
  const chainId = useAppSelector((s) => s.wallet.chainId)
  const [switchError, setSwitchError] = useState<string | null>(null)
  const [switchingTarget, setSwitchingTarget] = useState<number | null>(null)
  const [choosingWallet, setChoosingWallet] = useState(false)
  const autoAttemptKey = useRef<string>('')

  const walletConnector = useAppSelector((s) => s.wallet.connector)
  const stellarMode = useIsStellarTestnetMode()
  const skipEnforcer =
    isOnboardingConnectWalletPath(pathname) ||
    stellarMode ||
    preferred === 'stellar-testnet' ||
    walletConnector === 'stellar' ||
    isLocalOnlyDeployMode()

  const targetChain: Chain | null = useMemo(() => {
    if (skipEnforcer) return null
    if (authChainId != null && isSupportedAppChainId(authChainId)) {
      return getAppChainById(authChainId)
    }
    if (preferred === 'mainnet') return MAINNET_CHAIN
    if (preferred === 'testnet') return TESTNET_CHAIN
    return TESTNET_CHAIN
  }, [skipEnforcer, authChainId, preferred])

  const needsSwitch = Boolean(
    privyReady &&
      walletsReady &&
      isConnected &&
      address &&
      wallet &&
      targetChain &&
      chainId != null &&
      chainId !== targetChain.id,
  )

  const runEnsureWalletChain = useCallback(
    async (target: Chain, context: string) => {
      if (!wallet) return false
      setSwitchingTarget(target.id)
      try {
        await ensureWalletChain(wallet, target.id)
        setSwitchError(null)
        if (import.meta.env.DEV) {
          console.log(`[SupportedChainsWalletEnforcer] ensureWalletChain (${context}) OK`, {
            targetChainId: target.id,
            reduxChainIdAfter: store.getState().wallet.chainId,
          })
        }
        return true
      } catch (err) {
        logEnsureWalletChainFailure(context, err, {
          targetChainId: target.id,
          walletClientType: wallet.walletClientType,
          addressPreview: wallet.address ? `${wallet.address.slice(0, 8)}…` : null,
        })
        setSwitchError(formatWalletChainSwitchError(err, target.name))
        return false
      } finally {
        setSwitchingTarget(null)
      }
    },
    [wallet],
  )

  // Auto-switch whenever the wallet is on the wrong chain for this session / preference.
  useEffect(() => {
    if (skipEnforcer || !needsSwitch || !targetChain || !wallet || !address) {
      if (!needsSwitch) {
        setSwitchError(null)
        autoAttemptKey.current = ''
      }
      return
    }

    const key = `${address.toLowerCase()}:${chainId}:${targetChain.id}`
    if (autoAttemptKey.current === key) return
    autoAttemptKey.current = key

    let cancelled = false
    void (async () => {
      await runEnsureWalletChain(targetChain, 'auto')
      if (cancelled) return
    })()

    return () => {
      cancelled = true
    }
  }, [
    skipEnforcer,
    needsSwitch,
    targetChain,
    wallet,
    address,
    chainId,
    runEnsureWalletChain,
  ])

  const switching = switchingTarget != null
  // Show modal only after auto-switch failed / was rejected (not while the prompt is open).
  const showModal =
    needsSwitch &&
    !skipEnforcer &&
    !switching &&
    Boolean(switchError)

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

  const modalMessage = switchError
    ? switchError
    : targetChain
      ? `This app needs ${targetChain.name}. Approve the network switch in your wallet, choose a different wallet, or log out.`
      : getUnsupportedNetworkMessage()

  return (
    <DashboardErrorModal
      blocking
      open={showModal}
      title="Wrong network"
      message={modalMessage}
      retryLabel={switching ? 'Switching…' : `Switch to ${targetChain?.name ?? 'supported network'}`}
      retryDisabled={switching || choosingWallet || !targetChain || !wallet}
      onRetry={() => {
        if (!wallet || !targetChain) return
        autoAttemptKey.current = ''
        void runEnsureWalletChain(targetChain, 'retry')
      }}
      tertiaryLabel={choosingWallet ? 'Opening wallet picker…' : 'Choose a different wallet'}
      onTertiary={() => void handleChooseDifferentWallet()}
      secondaryLabel="Log out"
      onSecondary={() => void handleLogoutWrongNetwork()}
      onClose={() => {}}
    >
      <WrongNetworkHelp />
    </DashboardErrorModal>
  )
}
