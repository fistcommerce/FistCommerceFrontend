import { useCallback, useState } from 'react'
import type { Chain } from 'viem'

import { useCircleWallet } from '@/circle/CircleWalletProvider'
import DashboardErrorModal from '@/components/dashboard/shared/DashboardErrorModal'
import { isLocalOnlyDeployMode } from '@/contract_config/contractNetwork'
import { isUsableApiAccessToken } from '@/auth/accessTokenPolicy'
import { ARC_TESTNET_CHAIN, MAINNET_CHAIN, TESTNET_CHAIN } from '@/wallet/appChain'
import { isCircleAppWallet } from '@/wallet/appWallet'
import { useActiveWallet } from '@/wallet/useActiveWallet'
import { formatWalletChainSwitchError } from '@/wallet/walletChainErrors'
import { ensureWalletChain } from '@/wallet/viemClients'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { patchAuth } from '@/store/slices/authSlice'

type NetworkChoice = 'testnet' | 'mainnet' | 'arc-testnet'

const PREFERRED_NETWORK_KEY = 'fistcommerce.preferredNetwork'

const CHOICE_CHAIN: Record<NetworkChoice, Chain> = {
  testnet: TESTNET_CHAIN,
  mainnet: MAINNET_CHAIN,
  'arc-testnet': ARC_TESTNET_CHAIN,
}

const CHOICE_LABEL: Record<NetworkChoice, string> = {
  testnet: 'Testnet',
  mainnet: 'Mainnet',
  'arc-testnet': 'Arc Testnet',
}

export function readPreferredNetwork(): NetworkChoice {
  try {
    const raw = localStorage.getItem(PREFERRED_NETWORK_KEY)
    if (raw === 'mainnet' || raw === 'testnet' || raw === 'arc-testnet') return raw
  } catch {
    /* ignore */
  }
  return 'testnet'
}

function writePreferredNetwork(choice: NetworkChoice) {
  try {
    localStorage.setItem(PREFERRED_NETWORK_KEY, choice)
  } catch {
    /* ignore */
  }
}

function choiceFromChainId(chainId: number | null | undefined): NetworkChoice | null {
  if (chainId == null) return null
  if (chainId === MAINNET_CHAIN.id) return 'mainnet'
  if (chainId === TESTNET_CHAIN.id) return 'testnet'
  if (chainId === ARC_TESTNET_CHAIN.id) return 'arc-testnet'
  return null
}

type NetworkModeSwitcherProps = {
  /** Extra classes for the outer wrapper (e.g. absolute positioning). */
  className?: string
  /** Compact for tight headers. */
  compact?: boolean
}

/**
 * Network control for connect-wallet and admin login screens.
 * Switches the connected wallet when present; stores a preference otherwise.
 */
export default function NetworkModeSwitcher({ className, compact }: NetworkModeSwitcherProps) {
  const dispatch = useAppDispatch()
  const { wallet, isConnected } = useActiveWallet()
  const circle = useCircleWallet()
  const walletChainId = useAppSelector((s) => s.wallet.chainId)
  const fundingHopActive = useAppSelector((s) => Boolean(s.wallet.fundingHop?.active))
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const refreshToken = useAppSelector((s) => s.auth.refreshToken)
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preferred, setPreferred] = useState<NetworkChoice>(() => readPreferredNetwork())
  const [pendingChoice, setPendingChoice] = useState<NetworkChoice | null>(null)

  const fromWallet = choiceFromChainId(walletChainId)
  const active: NetworkChoice | null =
    fromWallet ?? (walletChainId != null ? null : preferred)
  const hasFistSession = Boolean(refreshToken?.trim()) || isUsableApiAccessToken(accessToken)
  const circleConnected = isCircleAppWallet(wallet)

  const applyChoice = useCallback(
    async (choice: NetworkChoice, allowCircleAddressChange: boolean) => {
      const target = CHOICE_CHAIN[choice]
      if (!isConnected || !wallet) return
      if (walletChainId === target.id) return

      setSwitching(true)
      try {
        if (circleConnected) {
          await circle.switchChain(target.id, { allowAddressChange: allowCircleAddressChange })
          return
        }
        await ensureWalletChain(wallet, target.id)
      } catch (e) {
        setError(formatWalletChainSwitchError(e, target.name))
      } finally {
        setSwitching(false)
      }
    },
    [circle, circleConnected, isConnected, wallet, walletChainId],
  )

  const select = useCallback(
    async (choice: NetworkChoice) => {
      if (switching || fundingHopActive) return
      if (isLocalOnlyDeployMode()) return
      setError(null)
      writePreferredNetwork(choice)
      setPreferred(choice)

      const target = CHOICE_CHAIN[choice]
      if (!isConnected || !wallet) return
      if (walletChainId === target.id) return

      if (circleConnected && hasFistSession) {
        setPendingChoice(choice)
        return
      }

      await applyChoice(choice, true)
    },
    [applyChoice, circleConnected, fundingHopActive, hasFistSession, isConnected, switching, wallet, walletChainId],
  )

  const confirmCircleNetworkChange = useCallback(async () => {
    const choice = pendingChoice
    setPendingChoice(null)
    if (!choice) return
    dispatch(
      patchAuth({
        accessToken: null,
        refreshToken: null,
        chainId: null,
        wallet: null,
      }),
    )
    await applyChoice(choice, true)
  }, [applyChoice, dispatch, pendingChoice])

  if (isLocalOnlyDeployMode()) return null

  const btnBase =
    'px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-[13px] font-semibold transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#195EBC]'
  const activeBtn = 'bg-[#195EBC] text-white'
  const idleBtn = 'bg-transparent text-[#4D5D80] hover:bg-[#F3F4F6]'

  const choices: NetworkChoice[] = ['testnet', 'mainnet', 'arc-testnet']
  const pendingChainName = pendingChoice ? CHOICE_CHAIN[pendingChoice].name : ''

  return (
    <div className={className}>
      <div
        className={`inline-flex items-center rounded-[8px] border border-[#E6E8EC] bg-white shadow-sm ${
          compact ? 'p-0.5' : 'p-1'
        }`}
        role="group"
        aria-label="Select network"
      >
        {choices.map((choice) => (
          <button
            key={choice}
            type="button"
            disabled={switching || fundingHopActive}
            aria-pressed={active === choice}
            onClick={() => void select(choice)}
            className={`${btnBase} rounded-[6px] ${active === choice ? activeBtn : idleBtn}`}
            title={CHOICE_CHAIN[choice].name}
          >
            {switching && preferred === choice && active !== choice
              ? 'Switching…'
              : CHOICE_LABEL[choice]}
          </button>
        ))}
      </div>
      {error ? (
        <p className="mt-1 max-w-[260px] text-right text-[11px] text-[#DC2626]" role="alert">
          {error}
        </p>
      ) : null}
      <DashboardErrorModal
        open={pendingChoice != null}
        title="Change Circle network?"
        message={`Circle Wallet uses a different address on ${pendingChainName}. You will be signed out and may need to verify identity again for the new address.`}
        retryLabel="Continue"
        onRetry={() => void confirmCircleNetworkChange()}
        secondaryLabel="Cancel"
        onSecondary={() => setPendingChoice(null)}
        onClose={() => setPendingChoice(null)}
      />
    </div>
  )
}
