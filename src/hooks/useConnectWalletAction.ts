import { useCallback, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'

import { toAppUserFacingError } from '@/errors/toAppUserFacingError'

/** Opens Privy wallet connection (external wallets + embedded wallet login). */
export function useConnectWalletAction() {
  const { ready: privyReady, connectWallet, login } = usePrivy()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clearError = useCallback(() => setError(null), [])

  const connect = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!privyReady) {
      return { ok: false, error: 'Wallet is still loading. Please wait a moment and try again.' }
    }
    if (pending) return { ok: false, error: 'Wallet connection is already in progress.' }
    setError(null)
    setPending(true)
    try {
      if (typeof connectWallet === 'function') {
        await connectWallet()
      } else {
        await login()
      }
      return { ok: true }
    } catch (e) {
      console.error(e)
      const message = toAppUserFacingError(e, {
        fallback: 'Could not connect wallet. Please try again.',
        context: 'onboarding',
      })
      setError(message)
      return { ok: false, error: message }
    } finally {
      setPending(false)
    }
  }, [privyReady, pending, connectWallet, login])

  return { connect, pending, privyReady, error, clearError }
}
