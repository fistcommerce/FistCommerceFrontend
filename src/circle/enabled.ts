import { isLocalOnlyDeployMode } from '@/contract_config/contractNetwork'
import type { CircleAuthMethod } from '@/circle/types'

/** Circle Wallet is off in local/Anvil mode and unless explicitly enabled. */
export function isCircleWalletEnabled(): boolean {
  if (isLocalOnlyDeployMode()) return false
  const raw = import.meta.env.VITE_CIRCLE_WALLET_ENABLED?.trim().toLowerCase()
  return raw === 'true' || raw === '1'
}

export function getCircleAppId(): string {
  return import.meta.env.VITE_CIRCLE_APP_ID?.trim() || ''
}

export function getCircleGoogleClientId(): string {
  return (
    import.meta.env.VITE_CIRCLE_GOOGLE_CLIENT_ID?.trim() ||
    import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID?.trim() ||
    import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ||
    ''
  )
}

export function getCircleFacebookAppId(): string {
  return import.meta.env.VITE_CIRCLE_FACEBOOK_APP_ID?.trim() || ''
}

/** Firebase web config JSON string for Apple social login (Circle SDK). */
export function getCircleAppleFirebaseConfig(): Record<string, string> | null {
  const raw = import.meta.env.VITE_CIRCLE_APPLE_FIREBASE_CONFIG?.trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return null
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string') out[k] = v
    }
    return Object.keys(out).length ? out : null
  } catch {
    return null
  }
}

export function isCircleAuthMethodConfigured(method: CircleAuthMethod): boolean {
  if (!isCircleWalletEnabled() || !getCircleAppId()) return false
  switch (method) {
    case 'google':
      return Boolean(getCircleGoogleClientId())
    case 'facebook':
      return Boolean(getCircleFacebookAppId())
    case 'apple':
      return Boolean(getCircleAppleFirebaseConfig())
    case 'email':
    case 'pin':
      return true
    default:
      return false
  }
}

export function circleWalletUnavailableReason(): string | null {
  if (isLocalOnlyDeployMode()) return 'Circle Wallet is not available in local mode.'
  if (!isCircleWalletEnabled()) return 'Circle Wallet is not enabled in this environment.'
  if (!getCircleAppId()) return 'Circle App ID is not configured (VITE_CIRCLE_APP_ID).'
  return null
}
