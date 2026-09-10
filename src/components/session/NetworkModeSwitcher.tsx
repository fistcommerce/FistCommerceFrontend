import { useCallback, useState } from 'react'

import { isLocalOnlyDeployMode } from '@/contract_config/contractNetwork'
import { MAINNET_CHAIN, TESTNET_CHAIN } from '@/wallet/appChain'
import { useActiveWallet } from '@/wallet/useActiveWallet'
import { formatWalletChainSwitchError } from '@/wallet/walletChainErrors'
import { ensureWalletChain } from '@/wallet/viemClients'
import { useAppSelector } from '@/store/hooks'

type NetworkChoice = 'testnet' | 'mainnet'

const PREFERRED_NETWORK_KEY = 'fistcommerce.preferredNetwork'

export function readPreferredNetwork(): NetworkChoice {
  try {
    const raw = localStorage.getItem(PREFERRED_NETWORK_KEY)
    if (raw === 'mainnet' || raw === 'testnet') return raw
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

type NetworkModeSwitcherProps = {
  /** Extra classes for the outer wrapper (e.g. absolute positioning). */
  className?: string
  /** Compact for tight headers. */
  compact?: boolean
}

/**
 * Testnet / Mainnet control for connect-wallet and admin login screens.
 * Switches the connected wallet when present; stores a preference otherwise.
 */
export default function NetworkModeSwitcher({ className, compact }: NetworkModeSwitcherProps) {
  const { wallet, isConnected } = useActiveWallet()
  const walletChainId = useAppSelector((s) => s.wallet.chainId)
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preferred, setPreferred] = useState<NetworkChoice>(() => readPreferredNetwork())

  const active: NetworkChoice | null =
    walletChainId === MAINNET_CHAIN.id
      ? 'mainnet'
      : walletChainId === TESTNET_CHAIN.id
        ? 'testnet'
        : walletChainId != null
          ? null
          : preferred

  const select = useCallback(
    async (choice: NetworkChoice) => {
      if (switching) return
      if (isLocalOnlyDeployMode()) return
      setError(null)
      writePreferredNetwork(choice)
      setPreferred(choice)

      const target = choice === 'mainnet' ? MAINNET_CHAIN : TESTNET_CHAIN
      if (!isConnected || !wallet) return
      if (walletChainId === target.id) return

      setSwitching(true)
      try {
        await ensureWalletChain(wallet, target.id)
      } catch (e) {
        setError(formatWalletChainSwitchError(e, target.name))
      } finally {
        setSwitching(false)
      }
    },
    [switching, isConnected, wallet, walletChainId],
  )

  if (isLocalOnlyDeployMode()) return null

  const btnBase =
    'px-3 py-1.5 text-[12px] sm:text-[13px] font-semibold transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#195EBC]'
  const activeBtn = 'bg-[#195EBC] text-white'
  const idleBtn = 'bg-transparent text-[#4D5D80] hover:bg-[#F3F4F6]'

  return (
    <div className={className}>
      <div
        className={`inline-flex items-center rounded-[8px] border border-[#E6E8EC] bg-white shadow-sm ${
          compact ? 'p-0.5' : 'p-1'
        }`}
        role="group"
        aria-label="Select network"
      >
        <button
          type="button"
          disabled={switching}
          aria-pressed={active === 'testnet'}
          onClick={() => void select('testnet')}
          className={`${btnBase} rounded-[6px] ${active === 'testnet' ? activeBtn : idleBtn}`}
        >
          {switching && preferred === 'testnet' && active !== 'testnet' ? 'Switching…' : 'Testnet'}
        </button>
        <button
          type="button"
          disabled={switching}
          aria-pressed={active === 'mainnet'}
          onClick={() => void select('mainnet')}
          className={`${btnBase} rounded-[6px] ${active === 'mainnet' ? activeBtn : idleBtn}`}
        >
          {switching && preferred === 'mainnet' && active !== 'mainnet' ? 'Switching…' : 'Mainnet'}
        </button>
      </div>
      {error ? (
        <p className="mt-1 max-w-[220px] text-right text-[11px] text-[#DC2626]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
