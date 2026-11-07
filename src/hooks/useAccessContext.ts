import { usePrivy } from '@privy-io/react-auth'
import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'

import type { AccessContext } from '@/access/types'
import { isStellarChainId } from '@/stellar/chain'
import { useAppSelector } from '@/store/hooks'
import { selectIsKycVerified, selectIsPersistReady } from '@/store/selectors/sessionSelectors'
import { useActiveWallet } from '@/wallet/useActiveWallet'
import { parseUserRole } from '@/utils/userRole'

function isStellarAccountAddress(wallet: string | null | undefined): boolean {
  const raw = wallet?.trim().toUpperCase() ?? ''
  return raw.startsWith('G') && raw.length === 56
}

/** Snapshot of route + auth + wallet + KYC used by access evaluators */
export function useAccessContext(): AccessContext {
  const location = useLocation()
  const { ready: privyReady } = usePrivy()
  const { isConnected: privyConnected, address: privyAddress, ready: walletsReady } = useActiveWallet()
  const auth = useAppSelector((s) => s.auth)
  const walletRedux = useAppSelector((s) => s.wallet)
  const onboarding = useAppSelector((s) => s.onboarding)
  const kycStatus = useAppSelector((s) => s.kyc.status)
  const kycFinancialAccess = useAppSelector(selectIsKycVerified)
  const persistedReady = useAppSelector(selectIsPersistReady)

  const stellarSession =
    isStellarChainId(auth.chainId) ||
    walletRedux.connector === 'stellar' ||
    isStellarChainId(walletRedux.chainId) ||
    isStellarAccountAddress(auth.wallet)

  // Stellar sessions use Freighter/kit + auth.wallet — do not wait on Privy wallet init.
  const address = stellarSession
    ? (walletRedux.address ?? auth.wallet)?.trim() || null
    : privyAddress ?? null
  const walletConnected = stellarSession ? Boolean(address) : privyConnected
  const status = walletConnected ? 'connected' : 'disconnected'
  const effectivePrivyReady = stellarSession || privyReady
  const effectiveWalletsReady = stellarSession || walletsReady

  return useMemo(
    () => ({
      pathname: location.pathname,
      persistedReady,
      privyReady: effectivePrivyReady,
      walletsReady: effectiveWalletsReady,
      role: parseUserRole(auth.role),
      onboarded: auth.onboarded,
      accessToken: auth.accessToken,
      sessionKind: auth.sessionKind,
      sessionExpired: Boolean(auth.sessionExpired),
      walletStatus: status,
      walletConnected,
      walletAddress: address,
      kycStatus,
      kycFinancialAccess,
      onboardingMaxStep: {
        investor: onboarding.investorMaxStep,
        merchant: onboarding.merchantMaxStep,
      },
      onboardingStepDirty: {
        investor: onboarding.investorStepDirty,
        merchant: onboarding.merchantStepDirty,
      },
    }),
    [
      location.pathname,
      persistedReady,
      effectivePrivyReady,
      effectiveWalletsReady,
      auth.role,
      auth.onboarded,
      auth.accessToken,
      auth.sessionKind,
      auth.sessionExpired,
      status,
      walletConnected,
      address,
      kycStatus,
      kycFinancialAccess,
      onboarding.investorMaxStep,
      onboarding.merchantMaxStep,
      onboarding.investorStepDirty,
      onboarding.merchantStepDirty,
    ],
  )
}
