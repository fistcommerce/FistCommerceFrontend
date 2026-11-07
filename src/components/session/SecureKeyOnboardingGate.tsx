import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { isStellarChainId } from '@/stellar/chain'
import { useAppSelector } from '@/store/hooks'
import { selectKeyBackupAcknowledged } from '@/store/slices/keyBackupSlice'
import { useActiveWallet } from '@/wallet/useActiveWallet'

type SecureKeyOnboardingGateProps = {
  role: 'investor' | 'merchant'
  children: ReactNode
}

function isStellarAccountAddress(wallet: string | null | undefined): boolean {
  const raw = wallet?.trim().toUpperCase() ?? ''
  return raw.startsWith('G') && raw.length === 56
}

/**
 * Blocks the profile-creation (verify-identity) step for embedded-wallet users who have not yet
 * acknowledged backing up their private key, redirecting them to the secure-key step. Prevents
 * skipping the backup step by deep-linking. External wallets, Stellar sessions, and already-onboarded
 * users pass through.
 */
export default function SecureKeyOnboardingGate({ role, children }: SecureKeyOnboardingGateProps) {
  const { address, walletClientType, ready } = useActiveWallet()
  const onboarded = useAppSelector((s) => s.auth.onboarded)
  const authChainId = useAppSelector((s) => s.auth.chainId)
  const sessionWallet = useAppSelector((s) => s.auth.wallet)
  const acknowledged = useAppSelector((s) => selectKeyBackupAcknowledged(s, address))

  // Stellar login uses Freighter/kit + session wallet — not Privy. Don't block on Privy ready.
  const isStellarSession =
    isStellarChainId(authChainId) ||
    isStellarAccountAddress(sessionWallet) ||
    isStellarAccountAddress(address)

  if (!isStellarSession && !ready) {
    return (
      <div className="flex min-h-[240px] w-full items-center justify-center">
        <p className="text-[#6B7488] text-[14px]">Loading your wallet…</p>
      </div>
    )
  }

  const isEmbedded = !isStellarSession && walletClientType === 'privy'

  // Only gate new embedded onboardings; never retro-gate returning/onboarded users or external wallets.
  if (!onboarded && isEmbedded && !acknowledged) {
    return <Navigate to={`/onboarding/${role}/secure-key`} replace />
  }

  return <>{children}</>
}
