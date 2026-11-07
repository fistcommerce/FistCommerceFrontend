import { getAddress, type Address, type Hex } from 'viem'

import { parseJsonResponse, requireApiBaseUrl } from '@/api/client'
import { sanitizeAccessToken, sanitizeRefreshToken } from '@/auth/accessTokenPolicy'
import type { WalletLoginSignable } from '@/api/walletSession'

/**
 * Admin wallet login per OpenAPI (`POST /auth/admin-login`).
 * EVM: EIP-712 + multisig owner. Stellar Testnet: ed25519 message + STELLAR_ADMIN_ADDRESS /
 * STELLAR_MULTISIG_OWNERS. Body must include `chainId` matching the signed payload.
 */
const ADMIN_LOGIN_PATH = '/api/auth/admin-login'

function isStellarAccountAddress(wallet: string): boolean {
  const raw = wallet.trim().toUpperCase()
  return raw.startsWith('G') && raw.length === 56
}

export type AdminLoginResponseBody = {
  successMessage?: string
  access_token: string
  refresh_token?: string
  /** Session-bound chain from login (must match the `chainId` sent in the request). */
  chain_id?: number
  /** Bare wallet address for this session. */
  wallet?: string
}

export type AdminLoginResult = {
  accessToken: string
  refreshToken: string | null
  successMessage: string
  chainId: number | null
  wallet: string | null
}

export async function postAdminWalletLogin(params: {
  signedMessage: WalletLoginSignable['signedMessageForApi']
  signature: Hex | string
  signerAddress: string
  /**
   * Required by API — must match the EIP-712 domain `chainId` used to sign
   * (and the active `APP_CHAIN.id`), or Stellar Testnet chain id.
   */
  chainId: number
}): Promise<AdminLoginResult> {
  const base = requireApiBaseUrl()
  const signerAddress = isStellarAccountAddress(params.signerAddress)
    ? params.signerAddress.trim().toUpperCase()
    : getAddress(params.signerAddress as Address)
  const res = await fetch(`${base}${ADMIN_LOGIN_PATH}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      signedMessage: params.signedMessage,
      signature: params.signature,
      signerAddress,
      chainId: params.chainId,
    }),
  })

  const body = await parseJsonResponse<AdminLoginResponseBody & { token?: string }>(res)
  const accessToken = sanitizeAccessToken(body.access_token ?? body.token)
  if (!accessToken) {
    throw new Error('Server did not return an access token.')
  }
  const refreshToken = sanitizeRefreshToken(body.refresh_token)
  const chainId =
    typeof body.chain_id === 'number' && Number.isFinite(body.chain_id) && body.chain_id > 0
      ? Math.trunc(body.chain_id)
      : null
  const wallet =
    typeof body.wallet === 'string' && body.wallet.trim() ? body.wallet.trim() : null

  return {
    accessToken,
    refreshToken,
    successMessage: body.successMessage?.trim() || 'successful authentication',
    chainId,
    wallet,
  }
}
