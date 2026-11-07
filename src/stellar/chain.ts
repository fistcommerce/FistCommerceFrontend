/** Stellar Testnet product chain id (network passphrase → numeric id used by Fist Commerce). */
export const STELLAR_TESTNET_CHAIN_ID = 1_397_037_394

export const STELLAR_TESTNET_LABEL = 'Stellar Testnet'

export function isStellarChainId(chainId: number | null | undefined): boolean {
  return chainId != null && Number.isFinite(chainId) && Math.trunc(chainId) === STELLAR_TESTNET_CHAIN_ID
}
