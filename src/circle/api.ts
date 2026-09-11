import { getAddress, type Address, type Hash, type Hex } from 'viem'

import { apiUrl, parseJsonResponse } from '@/api/client'
import { isUsableApiAccessToken } from '@/auth/accessTokenPolicy'
import { circleBlockchainFromChainId } from '@/circle/chainMap'
import type {
  CircleAuthCompleteResponse,
  CircleAuthMethod,
  CircleChallengeResult,
  CircleDeviceTokenResponse,
  CircleSessionResponse,
  CircleWalletRecord,
} from '@/circle/types'

function authHeaders(accessToken?: string | null, userToken?: string | null): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  const token = accessToken?.trim()
  if (token && isUsableApiAccessToken(token)) {
    headers.Authorization = /^Token\s+\S+/i.test(token) ? token : `Token ${token}`
  }
  const circleToken = userToken?.trim()
  if (circleToken) headers['X-Circle-User-Token'] = circleToken
  return headers
}

function asOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function parseWalletRecord(raw: unknown, fallbackChainId?: number): CircleWalletRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const walletId = asOptionalString(rec.walletId) ?? asOptionalString(rec.wallet_id)
  const addressRaw = asOptionalString(rec.address)
  const accountType = asOptionalString(rec.accountType) ?? asOptionalString(rec.account_type) ?? 'EOA'
  const blockchain = asOptionalString(rec.blockchain) ?? ''
  const chainIdRaw = rec.chainId ?? rec.chain_id
  const chainId =
    typeof chainIdRaw === 'number' && Number.isFinite(chainIdRaw)
      ? Math.trunc(chainIdRaw)
      : fallbackChainId
  if (!walletId || !addressRaw || chainId == null) return null
  return {
    walletId,
    address: getAddress(addressRaw as Address),
    chainId,
    accountType,
    blockchain,
  }
}

function parseSessionBody(body: Record<string, unknown>, chainId: number): CircleSessionResponse {
  const userToken = asOptionalString(body.userToken) ?? asOptionalString(body.user_token)
  const encryptionKey = asOptionalString(body.encryptionKey) ?? asOptionalString(body.encryption_key)
  const appId = asOptionalString(body.appId) ?? asOptionalString(body.app_id) ?? ''
  if (!userToken || !encryptionKey) {
    throw new Error('Circle session did not return user credentials.')
  }
  return {
    userToken,
    encryptionKey,
    appId,
    challengeId: asOptionalString(body.challengeId) ?? asOptionalString(body.challenge_id),
    wallet: parseWalletRecord(body.wallet, chainId),
    refreshToken: asOptionalString(body.refreshToken) ?? asOptionalString(body.refresh_token),
    authMethod: asOptionalString(body.authMethod) ?? asOptionalString(body.auth_method),
    circleUserId: asOptionalString(body.circleUserId) ?? asOptionalString(body.circle_user_id),
  }
}

export async function postCircleSocialToken(params: {
  deviceId: string
  accessToken?: string | null
}): Promise<CircleDeviceTokenResponse> {
  const res = await fetch(apiUrl('/circle/auth/social/token/'), {
    method: 'POST',
    headers: authHeaders(params.accessToken),
    body: JSON.stringify({ deviceId: params.deviceId }),
  })
  const body = await parseJsonResponse<Record<string, unknown>>(res)
  const deviceToken = asOptionalString(body.deviceToken) ?? asOptionalString(body.device_token)
  const deviceEncryptionKey =
    asOptionalString(body.deviceEncryptionKey) ?? asOptionalString(body.device_encryption_key)
  const appId = asOptionalString(body.appId) ?? asOptionalString(body.app_id) ?? ''
  if (!deviceToken || !deviceEncryptionKey) {
    throw new Error('Circle did not return social device credentials.')
  }
  return { deviceToken, deviceEncryptionKey, appId }
}

export async function postCircleEmailToken(params: {
  deviceId: string
  email: string
  accessToken?: string | null
}): Promise<CircleDeviceTokenResponse> {
  const res = await fetch(apiUrl('/circle/auth/email/token/'), {
    method: 'POST',
    headers: authHeaders(params.accessToken),
    body: JSON.stringify({ deviceId: params.deviceId, email: params.email }),
  })
  const body = await parseJsonResponse<Record<string, unknown>>(res)
  const deviceToken = asOptionalString(body.deviceToken) ?? asOptionalString(body.device_token)
  const deviceEncryptionKey =
    asOptionalString(body.deviceEncryptionKey) ?? asOptionalString(body.device_encryption_key)
  const otpToken = asOptionalString(body.otpToken) ?? asOptionalString(body.otp_token)
  const appId = asOptionalString(body.appId) ?? asOptionalString(body.app_id) ?? ''
  if (!deviceToken || !deviceEncryptionKey || !otpToken) {
    throw new Error('Circle did not return email OTP credentials.')
  }
  return {
    deviceToken,
    deviceEncryptionKey,
    otpToken,
    appId,
    email: asOptionalString(body.email) ?? params.email,
  }
}

export async function postCircleUserTokenRefresh(params: {
  userToken: string
  refreshToken: string
  accessToken?: string | null
}): Promise<CircleSessionResponse> {
  const res = await fetch(apiUrl('/circle/auth/token/refresh/'), {
    method: 'POST',
    headers: authHeaders(params.accessToken, params.userToken),
    body: JSON.stringify({
      userToken: params.userToken,
      refreshToken: params.refreshToken,
    }),
  })
  const body = await parseJsonResponse<Record<string, unknown>>(res)
  return parseSessionBody(body, 0)
}

export async function postCircleAuthComplete(params: {
  chainId: number
  userToken: string
  authMethod: CircleAuthMethod
  email?: string | null
  accessToken?: string | null
}): Promise<CircleAuthCompleteResponse> {
  const blockchain = circleBlockchainFromChainId(params.chainId)
  const res = await fetch(apiUrl('/circle/auth/complete/'), {
    method: 'POST',
    headers: authHeaders(params.accessToken, params.userToken),
    body: JSON.stringify({
      chainId: params.chainId,
      blockchain,
      authMethod: params.authMethod,
      ...(params.email ? { email: params.email } : {}),
    }),
  })
  const body = await parseJsonResponse<Record<string, unknown>>(res)
  const appId = asOptionalString(body.appId) ?? asOptionalString(body.app_id) ?? ''
  const chainId =
    typeof body.chainId === 'number'
      ? body.chainId
      : typeof body.chain_id === 'number'
        ? body.chain_id
        : params.chainId
  return {
    appId,
    challengeId: asOptionalString(body.challengeId) ?? asOptionalString(body.challenge_id),
    wallet: parseWalletRecord(body.wallet, chainId),
    chainId,
    circleUserId: asOptionalString(body.circleUserId) ?? asOptionalString(body.circle_user_id),
    authMethod: asOptionalString(body.authMethod) ?? asOptionalString(body.auth_method),
  }
}

/** PIN auth (Circle docs): pinUserId is the durable Circle userId. */
export async function postCircleSession(params: {
  deviceId?: string
  pinUserId?: string
  chainId: number
  accessToken?: string | null
}): Promise<CircleSessionResponse> {
  const blockchain = circleBlockchainFromChainId(params.chainId)
  const res = await fetch(apiUrl('/circle/sessions/'), {
    method: 'POST',
    headers: authHeaders(params.accessToken),
    body: JSON.stringify({
      ...(params.deviceId ? { deviceId: params.deviceId } : {}),
      ...(params.pinUserId ? { pinUserId: params.pinUserId } : {}),
      chainId: params.chainId,
      blockchain,
    }),
  })
  const body = await parseJsonResponse<Record<string, unknown>>(res)
  return parseSessionBody(body, params.chainId)
}

export async function postCircleSessionRefresh(params: {
  accessToken: string
  chainId?: number | null
}): Promise<CircleSessionResponse> {
  const res = await fetch(apiUrl('/circle/sessions/refresh/'), {
    method: 'POST',
    headers: authHeaders(params.accessToken),
    body: JSON.stringify({
      ...(params.chainId != null ? { chainId: params.chainId } : {}),
    }),
  })
  const body = await parseJsonResponse<Record<string, unknown>>(res)
  const chainId =
    typeof body.chainId === 'number'
      ? body.chainId
      : typeof body.chain_id === 'number'
        ? body.chain_id
        : params.chainId ?? 0
  return parseSessionBody(body, chainId)
}

export async function postCircleEnsureWallet(params: {
  chainId: number
  userToken: string
  accessToken?: string | null
}): Promise<CircleWalletRecord> {
  const blockchain = circleBlockchainFromChainId(params.chainId)
  const res = await fetch(apiUrl('/circle/wallets/ensure/'), {
    method: 'POST',
    headers: authHeaders(params.accessToken, params.userToken),
    body: JSON.stringify({
      chainId: params.chainId,
      blockchain,
      accountType: 'EOA',
    }),
  })
  const body = await parseJsonResponse<Record<string, unknown>>(res)
  if (res.status === 409) {
    const challengeId = asOptionalString(body.challengeId) ?? asOptionalString(body.challenge_id)
    const err = new Error(
      challengeId
        ? 'Circle wallet creation requires PIN confirmation.'
        : 'Circle did not return a wallet on this network.',
    ) as Error & { challengeId?: string; code?: string }
    err.challengeId = challengeId ?? undefined
    err.code = asOptionalString(body.code) ?? 'wallet_creation_required'
    throw err
  }
  const wallet = parseWalletRecord(body.wallet ?? body, params.chainId)
  if (!wallet) throw new Error('Circle did not return a wallet on this network.')
  if (wallet.accountType && wallet.accountType !== 'EOA') {
    throw new Error('This Circle account type is not supported. Use an EOA Circle wallet.')
  }
  return wallet
}

export async function postCircleSignTypedData(params: {
  walletId: string
  chainId: number
  typedData: unknown
  userToken: string
  accessToken?: string | null
  idempotencyKey: string
}): Promise<{ challengeId: string }> {
  const res = await fetch(apiUrl('/circle/sign/typed-data/'), {
    method: 'POST',
    headers: authHeaders(params.accessToken, params.userToken),
    body: JSON.stringify({
      walletId: params.walletId,
      chainId: params.chainId,
      typedData: params.typedData,
      idempotencyKey: params.idempotencyKey,
    }),
  })
  const body = await parseJsonResponse<Record<string, unknown>>(res)
  const challengeId = asOptionalString(body.challengeId) ?? asOptionalString(body.challenge_id)
  if (!challengeId) throw new Error('Circle did not return a signing challenge.')
  return { challengeId }
}

export async function postCircleSendTransaction(params: {
  walletId: string
  chainId: number
  to: Address
  data?: Hex
  value?: Hex
  userToken: string
  accessToken?: string | null
  idempotencyKey: string
}): Promise<{ challengeId: string }> {
  const res = await fetch(apiUrl('/circle/transactions/send/'), {
    method: 'POST',
    headers: authHeaders(params.accessToken, params.userToken),
    body: JSON.stringify({
      walletId: params.walletId,
      chainId: params.chainId,
      to: params.to,
      data: params.data ?? '0x',
      value: params.value ?? '0x0',
      feeLevel: 'MEDIUM',
      idempotencyKey: params.idempotencyKey,
    }),
  })
  const body = await parseJsonResponse<Record<string, unknown>>(res)
  const challengeId = asOptionalString(body.challengeId) ?? asOptionalString(body.challenge_id)
  if (!challengeId) throw new Error('Circle did not return a transaction challenge.')
  return { challengeId }
}

export async function getCircleChallenge(params: {
  challengeId: string
  userToken: string
  accessToken?: string | null
}): Promise<CircleChallengeResult> {
  const res = await fetch(apiUrl(`/circle/challenges/${encodeURIComponent(params.challengeId)}/`), {
    method: 'GET',
    headers: authHeaders(params.accessToken, params.userToken),
  })
  const body = await parseJsonResponse<Record<string, unknown>>(res)
  const statusRaw = (asOptionalString(body.status) ?? 'pending').toLowerCase()
  const status: CircleChallengeResult['status'] =
    statusRaw === 'complete' || statusRaw === 'completed' || statusRaw === 'success'
      ? 'complete'
      : statusRaw === 'failed' || statusRaw === 'error' || statusRaw === 'denied'
        ? 'failed'
        : 'pending'
  const signature = (asOptionalString(body.signature) ?? null) as Hex | null
  const txHash = (asOptionalString(body.txHash) ?? asOptionalString(body.tx_hash) ?? null) as Hash | null
  return {
    status,
    signature,
    txHash,
    error: asOptionalString(body.error) ?? asOptionalString(body.message),
  }
}
