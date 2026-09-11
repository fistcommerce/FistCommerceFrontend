import { getAddress, type Address } from 'viem'

import type { CircleAuthMethod, CircleSecretBundle, CircleWalletRef } from '@/circle/types'

const DEVICE_ID_KEY = 'fistcommerce.circleDeviceId'
const WALLET_REF_KEY = 'fistcommerce.circleWalletRef'
const SECRETS_KEY = 'fistcommerce.circleSecrets'
const SOCIAL_PENDING_KEY = 'fistcommerce.circleSocialPending'
const PIN_USER_KEY = 'fistcommerce.circlePinUserId'

export type CircleSocialPending = {
  deviceToken: string
  deviceEncryptionKey: string
  provider: 'google' | 'apple' | 'facebook'
  chainId: number
  redirectUri: string
}

function safeGet(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(storage: Storage, key: string, value: string | null) {
  try {
    if (!value) storage.removeItem(key)
    else storage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function newCircleDeviceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** Fallback UUID device id (PIN path). Prefer SDK getDeviceId for social/email. */
export function getOrCreateCircleDeviceId(): string {
  if (typeof window === 'undefined') return newCircleDeviceId()
  const existing = safeGet(window.localStorage, DEVICE_ID_KEY)?.trim()
  if (existing && UUID_RE.test(existing)) return existing
  const id = newCircleDeviceId()
  safeSet(window.localStorage, DEVICE_ID_KEY, id)
  return id
}

export function rememberCircleSdkDeviceId(deviceId: string) {
  if (typeof window === 'undefined') return
  const id = deviceId.trim()
  if (!id) return
  safeSet(window.localStorage, DEVICE_ID_KEY, id)
}

export function readCircleWalletRef(): CircleWalletRef | null {
  if (typeof window === 'undefined') return null
  const raw = safeGet(window.localStorage, WALLET_REF_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<CircleWalletRef>
    const walletId = typeof parsed.walletId === 'string' ? parsed.walletId.trim() : ''
    const addressRaw = typeof parsed.address === 'string' ? parsed.address.trim() : ''
    const chainId =
      typeof parsed.chainId === 'number' && Number.isFinite(parsed.chainId)
        ? Math.trunc(parsed.chainId)
        : NaN
    if (!walletId || !addressRaw || !Number.isFinite(chainId)) return null
    return { walletId, address: getAddress(addressRaw as Address), chainId }
  } catch {
    return null
  }
}

export function writeCircleWalletRef(ref: CircleWalletRef | null) {
  if (typeof window === 'undefined') return
  if (!ref) {
    safeSet(window.localStorage, WALLET_REF_KEY, null)
    return
  }
  safeSet(
    window.localStorage,
    WALLET_REF_KEY,
    JSON.stringify({
      walletId: ref.walletId,
      address: getAddress(ref.address),
      chainId: ref.chainId,
    }),
  )
}

export function readCircleSecrets(): CircleSecretBundle | null {
  if (typeof window === 'undefined') return null
  const raw = safeGet(window.sessionStorage, SECRETS_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<CircleSecretBundle>
    const userToken = typeof parsed.userToken === 'string' ? parsed.userToken.trim() : ''
    const encryptionKey = typeof parsed.encryptionKey === 'string' ? parsed.encryptionKey.trim() : ''
    const appId = typeof parsed.appId === 'string' ? parsed.appId.trim() : ''
    const refreshToken =
      typeof parsed.refreshToken === 'string' && parsed.refreshToken.trim()
        ? parsed.refreshToken.trim()
        : null
    if (!userToken || !encryptionKey) return null
    return { userToken, encryptionKey, appId, refreshToken }
  } catch {
    return null
  }
}

export function writeCircleSecrets(secrets: CircleSecretBundle | null) {
  if (typeof window === 'undefined') return
  if (!secrets) {
    safeSet(window.sessionStorage, SECRETS_KEY, null)
    return
  }
  safeSet(
    window.sessionStorage,
    SECRETS_KEY,
    JSON.stringify({
      userToken: secrets.userToken,
      encryptionKey: secrets.encryptionKey,
      appId: secrets.appId,
      refreshToken: secrets.refreshToken ?? null,
    }),
  )
}

export function writeCircleSocialPending(pending: CircleSocialPending | null) {
  if (typeof window === 'undefined') return
  if (!pending) {
    safeSet(window.sessionStorage, SOCIAL_PENDING_KEY, null)
    return
  }
  safeSet(window.sessionStorage, SOCIAL_PENDING_KEY, JSON.stringify(pending))
}

export function readCircleSocialPending(): CircleSocialPending | null {
  if (typeof window === 'undefined') return null
  const raw = safeGet(window.sessionStorage, SOCIAL_PENDING_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<CircleSocialPending>
    if (
      !parsed.deviceToken ||
      !parsed.deviceEncryptionKey ||
      !parsed.provider ||
      typeof parsed.chainId !== 'number'
    ) {
      return null
    }
    return {
      deviceToken: parsed.deviceToken,
      deviceEncryptionKey: parsed.deviceEncryptionKey,
      provider: parsed.provider,
      chainId: parsed.chainId,
      redirectUri: typeof parsed.redirectUri === 'string' ? parsed.redirectUri : '',
    }
  } catch {
    return null
  }
}

export function writeCirclePinUserId(pinUserId: string | null) {
  if (typeof window === 'undefined') return
  safeSet(window.localStorage, PIN_USER_KEY, pinUserId?.trim() || null)
}

export function readCirclePinUserId(): string | null {
  if (typeof window === 'undefined') return null
  return safeGet(window.localStorage, PIN_USER_KEY)?.trim() || null
}

export function clearCircleClientState() {
  writeCircleWalletRef(null)
  writeCircleSecrets(null)
  writeCircleSocialPending(null)
}

export function circleAuthMethodLabel(method: CircleAuthMethod): string {
  switch (method) {
    case 'google':
      return 'Google'
    case 'apple':
      return 'Apple'
    case 'facebook':
      return 'Facebook'
    case 'email':
      return 'Email'
    case 'pin':
      return 'PIN'
  }
}
