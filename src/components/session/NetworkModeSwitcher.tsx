import { useCallback, useState } from 'react'

import { isLocalOnlyDeployMode } from '@/contract_config/contractNetwork'
import {
  type PreferredNetwork,
  readPreferredAppNetwork,
  writePreferredAppNetwork,
} from '@/contract_config/networkCapabilities'
import { STELLAR_TESTNET_CHAIN_ID, STELLAR_TESTNET_LABEL } from '@/stellar/chain'
import { disconnectStellarWalletKit } from '@/stellar/walletsKit'
import { MAINNET_CHAIN, TESTNET_CHAIN } from '@/wallet/appChain'
import { useActiveWallet } from '@/wallet/useActiveWallet'
import { formatWalletChainSwitchError } from '@/wallet/walletChainErrors'
import { ensureWalletChain } from '@/wallet/viemClients'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { resetWallet } from '@/store/slices/walletSlice'

/** @deprecated Prefer readPreferredAppNetwork from networkCapabilities */
export function readPreferredNetwork(): Exclude<PreferredNetwork, 'stellar-testnet'> {
  const n = readPreferredAppNetwork()
  return n === 'stellar-testnet' ? 'testnet' : n
}

export function selectedNetworkChain() {
  return readPreferredAppNetwork() === 'mainnet' ? MAINNET_CHAIN : TESTNET_CHAIN
}

/** Login / display target for the preferred app network (includes Stellar Testnet). */
export function selectedLoginNetwork(): { id: number; name: string; isStellar: boolean } {
  if (readPreferredAppNetwork() === 'stellar-testnet') {
    return { id: STELLAR_TESTNET_CHAIN_ID, name: STELLAR_TESTNET_LABEL, isStellar: true }
  }
  const chain = selectedNetworkChain()
  return { id: chain.id, name: chain.name, isStellar: false }
}

type NetworkModeSwitcherProps = {
  className?: string
  compact?: boolean
}

/**
 * Arbitrum Testnet / Mainnet / Stellar Testnet control.
 * Stellar mode stores preference only (no EIP-155 chain switch).
 */
export default function NetworkModeSwitcher({ className, compact }: NetworkModeSwitcherProps) {
  const dispatch = useAppDispatch()
  const { wallet, isConnected } = useActiveWallet()
  const walletChainId = useAppSelector((s) => s.wallet.chainId)
  const walletConnector = useAppSelector((s) => s.wallet.connector)
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preferred, setPreferred] = useState<PreferredNetwork>(() => readPreferredAppNetwork())

  const active: PreferredNetwork =
    preferred === 'stellar-testnet'
      ? 'stellar-testnet'
      : walletChainId === MAINNET_CHAIN.id
        ? 'mainnet'
        : walletChainId === TESTNET_CHAIN.id
          ? 'testnet'
          : preferred === 'mainnet'
            ? 'mainnet'
            : 'testnet'

  const select = useCallback(
    async (choice: PreferredNetwork) => {
      if (switching) return
      if (isLocalOnlyDeployMode()) return
      setError(null)
      const prev = readPreferredAppNetwork()
      writePreferredAppNetwork(choice)
      setPreferred(choice)

      if (choice === 'stellar-testnet') {
        // Leaving EVM adapter ownership — Stellar Wallet Kit is the only connector.
        if (walletConnector === 'evm' || (!walletConnector && isConnected)) {
          dispatch(resetWallet())
        }
        return
      }

      if (prev === 'stellar-testnet' || walletConnector === 'stellar') {
        await disconnectStellarWalletKit()
        dispatch(resetWallet())
      }

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
    [switching, isConnected, wallet, walletChainId, walletConnector, dispatch],
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
        <button
          type="button"
          disabled={switching}
          aria-pressed={active === 'stellar-testnet'}
          onClick={() => void select('stellar-testnet')}
          className={`${btnBase} rounded-[6px] ${active === 'stellar-testnet' ? activeBtn : idleBtn}`}
        >
          Stellar Testnet
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
