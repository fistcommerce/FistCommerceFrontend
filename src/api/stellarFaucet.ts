import { apiUrl, parseJsonResponse } from '@/api/client'
import { fetchWithAuthRecovery } from '@/api/authorizedFetch'

const MINT_PATH = '/metrics/stellar/faucet/mint/'

export type StellarFaucetMintResult = {
  successMessage?: string
  hash: string
  amount: string
  asset: string
  destination: string
  issuer: string
}

/** `POST /api/metrics/stellar/faucet/mint/` — issuer-signed FISTUSD payment on Testnet. */
export async function mintStellarTestTokens(params?: {
  amount?: number
  accessToken: string
}): Promise<StellarFaucetMintResult> {
  const accessToken = params?.accessToken?.trim()
  if (!accessToken) throw new Error('Sign in to mint test tokens.')

  const body: Record<string, number> = {}
  if (params?.amount != null && Number.isFinite(params.amount)) {
    body.amount = params.amount
  }

  const res = await fetchWithAuthRecovery(apiUrl(MINT_PATH), {
    method: 'POST',
    headers: {
      Authorization: `Token ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  return parseJsonResponse<StellarFaucetMintResult>(res)
}
