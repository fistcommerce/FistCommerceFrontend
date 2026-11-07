import { useCallback, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'

import { readPreferredAppNetwork } from '@/contract_config/networkCapabilities'
import { toAppUserFacingError } from '@/errors/toAppUserFacingError'
import { useAppDispatch } from '@/store/hooks'
import { resetWallet, setWalletFromProvider } from '@/store/slices/walletSlice'
import { STELLAR_TESTNET_CHAIN_ID } from '@/stellar/chain'
import { connectStellarWalletViaKit } from '@/stellar/walletsKit'

/**
 * Admin dashboard connect:
 * - Stellar Testnet → Stellar Wallets Kit (force reselect so a different wallet can be chosen)
 * - EVM networks → Privy connectWallet / login
 */
export function useConnectWalletAction() {
  const dispatch = useAppDispatch()
  const { ready: privyReady, connectWallet, login } = usePrivy()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clearError = useCallback(() => setError(null), [])

  const connect = useCallback(async () => {
    if (pending) return
    setError(null)
    setPending(true)
    try {
      if (readPreferredAppNetwork() === 'stellar-testnet') {
        dispatch(resetWallet())
        const { address } = await connectStellarWalletViaKit({ forceReselect: true })
        dispatch(
          setWalletFromProvider({
            isConnected: true,
            address,
            chainId: STELLAR_TESTNET_CHAIN_ID,
            connector: 'stellar',
          }),
        )
        return
      }

      if (!privyReady) {
        setError('Wallet connection is still loading. Try again in a moment.')
        return
      }
      if (typeof connectWallet === 'function') {
        await connectWallet()
      } else {
        await login()
      }
    } catch (e) {
      console.error(e)
      setError(
        toAppUserFacingError(e, {
          fallback: 'Could not connect wallet. Please try again.',
          context: 'onboarding',
        }),
      )
    } finally {
      setPending(false)
    }
  }, [connectWallet, dispatch, login, pending, privyReady])

  return { connect, pending, privyReady, error, clearError }
}
