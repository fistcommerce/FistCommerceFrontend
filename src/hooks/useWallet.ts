import { useAppSelector } from '@/store/hooks'
import { isStellarChainId, STELLAR_TESTNET_CHAIN_ID } from '@/stellar/chain'
import type { WalletConnector } from '@/store/slices/walletSlice'
import { formatWalletAddressForTopBar } from '@/utils/formatWalletAddressForTopBar'
import { useActiveWallet } from '@/wallet/useActiveWallet'

/**
 * Live wallet for UI: Privy/EVM via {@link useActiveWallet}, Stellar via Redux
 * (and auth session fallback after reload when the kit mirror is empty).
 */
export function useWallet() {
  const redux = useAppSelector((s) => s.wallet)
  const authWallet = useAppSelector((s) => s.auth.wallet)
  const authChainId = useAppSelector((s) => s.auth.chainId)
  const { isConnected: privyConnected, address: privyAddr } = useActiveWallet()

  const stellar =
    redux.connector === 'stellar' ||
    isStellarChainId(redux.chainId) ||
    isStellarChainId(authChainId)

  if (stellar) {
    const address = (redux.address ?? authWallet)?.trim() || null
    const connected = Boolean(address)
    return {
      redux,
      isConnected: connected,
      address,
      chainId: redux.chainId ?? authChainId ?? STELLAR_TESTNET_CHAIN_ID,
      connector: 'stellar' as WalletConnector,
      shortAddress: connected && address ? formatWalletAddressForTopBar(address) : null,
    }
  }

  return {
    redux,
    isConnected: privyConnected,
    address: privyAddr,
    chainId: redux.chainId,
    connector: (redux.connector ?? (privyConnected ? 'evm' : null)) as WalletConnector | null,
    shortAddress: privyConnected && privyAddr ? formatWalletAddressForTopBar(privyAddr) : null,
  }
}
