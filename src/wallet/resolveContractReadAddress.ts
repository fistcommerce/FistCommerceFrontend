/**
 * Circle uses a different address per chain. On-chain balance / pool reads must use the
 * Fist session identity (usually Arc), never a temporary CCTP hop SCA.
 *
 * When Circle is restoring, live address may be briefly null — fall back to auth.wallet
 * so invest UI can still load balances for the logged-in session.
 */
export function resolveContractReadAddress(params: {
  source: string | null | undefined
  liveAddress: string | null | undefined
  authWallet: string | null | undefined
  fundingSessionWallet?: string | null | undefined
}): string | null {
  const live = params.liveAddress?.trim() || null
  const auth = params.authWallet?.trim() || null
  const funding = params.fundingSessionWallet?.trim() || null

  if (params.source === 'circle') {
    return funding || auth || live
  }

  // Session fallback: Fist login knows the wallet before the provider finishes restoring.
  if (!live && auth) return auth
  return live
}

/** True when we have an address we can use for balance / pool reads. */
export function canReadContractBalances(params: {
  readAddress: string | null | undefined
  contractsChainId: number | null | undefined
  isSupportedAppChainId: (chainId: number | null | undefined) => boolean
}): boolean {
  return Boolean(
    params.readAddress?.trim() &&
      params.contractsChainId != null &&
      params.isSupportedAppChainId(params.contractsChainId),
  )
}
