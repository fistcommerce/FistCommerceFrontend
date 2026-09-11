import {
  getCircleAppleFirebaseConfig,
  getCircleAppId,
  getCircleFacebookAppId,
  getCircleGoogleClientId,
} from '@/circle/enabled'
import { CircleUserRejectedError, isCircleUserRejectedError } from '@/circle/errors'
import { rememberCircleSdkDeviceId } from '@/circle/storage'
import type { CircleAuthMethod, CircleChallengeResult } from '@/circle/types'

type CircleSdkAuth = {
  userToken: string
  encryptionKey: string
  appId?: string
}

type SocialProvider = 'google' | 'apple' | 'facebook'

type LoginCompleteResult = {
  userToken: string
  encryptionKey: string
  refreshToken?: string
}

type CircleSdkLike = {
  setAppSettings?: (settings: { appId: string }) => void
  setAuthentication?: (auth: { userToken: string; encryptionKey: string }) => void
  updateConfigs?: (configs: unknown, onLoginComplete?: (error: unknown, result: unknown) => void) => void
  getDeviceId?: () => Promise<string>
  performLogin?: (provider: string) => Promise<void>
  verifyOtp?: () => void
  execute: (
    challengeId: string,
    callback?: (error: unknown, result: unknown) => void,
  ) => Promise<unknown> | void
}

type SdkModule = {
  W3SSdk?: new (config?: unknown, onLoginComplete?: (error: unknown, result: unknown) => void) => CircleSdkLike
  default?: new (config?: unknown, onLoginComplete?: (error: unknown, result: unknown) => void) => CircleSdkLike
  SocialLoginProvider?: {
    GOOGLE: string
    APPLE: string
    FACEBOOK: string
  }
}

let sdkPromise: Promise<CircleSdkLike> | null = null
let socialProviderEnum: SdkModule['SocialLoginProvider'] | null = null
let pendingLoginResolver: {
  resolve: (value: LoginCompleteResult) => void
  reject: (reason?: unknown) => void
} | null = null

async function loadCircleSdkModule(): Promise<SdkModule> {
  return (await import('@circle-fin/w3s-pw-web-sdk')) as unknown as SdkModule
}

async function loadCircleSdkCtor(): Promise<{
  Ctor: new (config?: unknown, onLoginComplete?: (error: unknown, result: unknown) => void) => CircleSdkLike
  SocialLoginProvider?: SdkModule['SocialLoginProvider']
}> {
  const mod = await loadCircleSdkModule()
  const Ctor = mod.W3SSdk ?? mod.default
  if (!Ctor) {
    throw new Error('Circle Wallet SDK is not available in this build.')
  }
  socialProviderEnum = mod.SocialLoginProvider ?? null
  return { Ctor, SocialLoginProvider: mod.SocialLoginProvider }
}

function onLoginComplete(error: unknown, result: unknown) {
  const pending = pendingLoginResolver
  pendingLoginResolver = null
  if (!pending) return
  if (error) {
    pending.reject(error)
    return
  }
  if (!result || typeof result !== 'object') {
    pending.reject(new Error('Circle login did not return credentials.'))
    return
  }
  const rec = result as Record<string, unknown>
  const userToken = typeof rec.userToken === 'string' ? rec.userToken : ''
  const encryptionKey = typeof rec.encryptionKey === 'string' ? rec.encryptionKey : ''
  const refreshToken = typeof rec.refreshToken === 'string' ? rec.refreshToken : undefined
  if (!userToken || !encryptionKey) {
    pending.reject(new Error('Circle login did not return userToken/encryptionKey.'))
    return
  }
  pending.resolve({ userToken, encryptionKey, refreshToken })
}

async function getSdk(appId?: string): Promise<CircleSdkLike> {
  if (!sdkPromise) {
    sdkPromise = (async () => {
      const { Ctor } = await loadCircleSdkCtor()
      const resolvedAppId = (appId ?? getCircleAppId()).trim() || getCircleAppId()
      try {
        return new Ctor({ appSettings: { appId: resolvedAppId } }, onLoginComplete)
      } catch {
        const sdk = new Ctor(undefined, onLoginComplete)
        sdk.setAppSettings?.({ appId: resolvedAppId })
        return sdk
      }
    })()
  }
  return sdkPromise
}

function resultToChallenge(result: unknown): CircleChallengeResult | null {
  if (!result || typeof result !== 'object') return null
  const rec = result as Record<string, unknown>
  const data = rec.data && typeof rec.data === 'object' ? (rec.data as Record<string, unknown>) : rec
  const statusRaw = String(rec.status ?? rec.state ?? 'complete').toLowerCase()
  const signature =
    typeof data.signature === 'string'
      ? data.signature
      : typeof rec.signature === 'string'
        ? rec.signature
        : null
  const txHash =
    typeof data.txHash === 'string'
      ? data.txHash
      : typeof data.tx_hash === 'string'
        ? data.tx_hash
        : typeof rec.txHash === 'string'
          ? rec.txHash
          : null
  if (statusRaw.includes('fail') || statusRaw.includes('error') || statusRaw.includes('denied')) {
    return { status: 'failed', error: String(rec.message ?? rec.error ?? 'Circle challenge failed.') }
  }
  if (signature || txHash || statusRaw.includes('complete') || statusRaw.includes('success')) {
    return {
      status: 'complete',
      signature: signature as CircleChallengeResult['signature'],
      txHash: txHash as CircleChallengeResult['txHash'],
    }
  }
  return { status: 'pending' }
}

export async function authenticateCircleSdk(auth: CircleSdkAuth): Promise<void> {
  const sdk = await getSdk(auth.appId ?? getCircleAppId())
  sdk.setAuthentication?.({
    userToken: auth.userToken,
    encryptionKey: auth.encryptionKey,
  })
}

export async function getCircleSdkDeviceId(appId?: string): Promise<string> {
  const sdk = await getSdk(appId ?? getCircleAppId())
  if (!sdk.getDeviceId) {
    throw new Error('Circle SDK getDeviceId is unavailable.')
  }
  const id = await sdk.getDeviceId()
  rememberCircleSdkDeviceId(id)
  return id
}

function mapSocialProvider(method: SocialProvider): string {
  const enumMap = socialProviderEnum
  if (enumMap) {
    if (method === 'google') return enumMap.GOOGLE
    if (method === 'apple') return enumMap.APPLE
    if (method === 'facebook') return enumMap.FACEBOOK
  }
  if (method === 'google') return 'Google'
  if (method === 'apple') return 'Apple'
  return 'Facebook'
}

export async function performCircleSocialLogin(params: {
  provider: SocialProvider
  deviceToken: string
  deviceEncryptionKey: string
  appId?: string
  redirectUri?: string
}): Promise<LoginCompleteResult> {
  const appId = params.appId ?? getCircleAppId()
  const sdk = await getSdk(appId)
  await loadCircleSdkCtor()

  const redirectUri = params.redirectUri || (typeof window !== 'undefined' ? window.location.origin : '')
  const loginConfigs: Record<string, unknown> = {
    deviceToken: params.deviceToken,
    deviceEncryptionKey: params.deviceEncryptionKey,
  }

  if (params.provider === 'google') {
    const clientId = getCircleGoogleClientId()
    if (!clientId) throw new Error('Google client ID is not configured for Circle.')
    loginConfigs.google = {
      clientId,
      redirectUri,
      selectAccountPrompt: true,
    }
  } else if (params.provider === 'facebook') {
    const fbAppId = getCircleFacebookAppId()
    if (!fbAppId) throw new Error('Facebook App ID is not configured for Circle.')
    loginConfigs.facebook = {
      appId: fbAppId,
      redirectUri,
    }
  } else {
    const firebase = getCircleAppleFirebaseConfig()
    if (!firebase) throw new Error('Apple Firebase config is not configured for Circle.')
    loginConfigs.apple = firebase
  }

  const loginPromise = new Promise<LoginCompleteResult>((resolve, reject) => {
    pendingLoginResolver = { resolve, reject }
  })

  sdk.updateConfigs?.(
    {
      appSettings: { appId },
      loginConfigs,
    },
    onLoginComplete,
  )

  if (!sdk.performLogin) {
    throw new Error('Circle SDK performLogin is unavailable.')
  }
  await sdk.performLogin(mapSocialProvider(params.provider))
  return loginPromise
}

export async function performCircleEmailOtpLogin(params: {
  email: string
  deviceToken: string
  deviceEncryptionKey: string
  otpToken: string
  appId?: string
}): Promise<LoginCompleteResult> {
  const appId = params.appId ?? getCircleAppId()
  const sdk = await getSdk(appId)

  const loginPromise = new Promise<LoginCompleteResult>((resolve, reject) => {
    pendingLoginResolver = { resolve, reject }
  })

  sdk.updateConfigs?.(
    {
      appSettings: { appId },
      loginConfigs: {
        deviceToken: params.deviceToken,
        deviceEncryptionKey: params.deviceEncryptionKey,
        otpToken: params.otpToken,
        email: { email: params.email },
      },
    },
    onLoginComplete,
  )

  if (!sdk.verifyOtp) {
    throw new Error('Circle SDK verifyOtp is unavailable.')
  }
  sdk.verifyOtp()
  return loginPromise
}

/** Resume social login callback after OAuth redirect. */
export async function awaitCircleSocialLoginReturn(params: {
  deviceToken: string
  deviceEncryptionKey: string
  provider: SocialProvider
  appId?: string
  redirectUri?: string
}): Promise<LoginCompleteResult> {
  const appId = params.appId ?? getCircleAppId()
  const sdk = await getSdk(appId)
  await loadCircleSdkCtor()

  const redirectUri = params.redirectUri || (typeof window !== 'undefined' ? window.location.origin : '')
  const loginConfigs: Record<string, unknown> = {
    deviceToken: params.deviceToken,
    deviceEncryptionKey: params.deviceEncryptionKey,
  }
  if (params.provider === 'google') {
    loginConfigs.google = {
      clientId: getCircleGoogleClientId(),
      redirectUri,
      selectAccountPrompt: true,
    }
  } else if (params.provider === 'facebook') {
    loginConfigs.facebook = {
      appId: getCircleFacebookAppId(),
      redirectUri,
    }
  } else {
    loginConfigs.apple = getCircleAppleFirebaseConfig()
  }

  const loginPromise = new Promise<LoginCompleteResult>((resolve, reject) => {
    pendingLoginResolver = { resolve, reject }
  })

  sdk.updateConfigs?.(
    {
      appSettings: { appId },
      loginConfigs,
    },
    onLoginComplete,
  )

  // SDK processes redirect query on construct/updateConfigs; race a short timeout.
  return Promise.race([
    loginPromise,
    new Promise<LoginCompleteResult>((_, reject) => {
      window.setTimeout(() => {
        if (pendingLoginResolver) {
          pendingLoginResolver = null
          reject(new Error('Circle social login did not complete after redirect.'))
        }
      }, 15_000)
    }),
  ])
}

export async function executeCircleChallenge(
  challengeId: string,
  auth: CircleSdkAuth,
): Promise<CircleChallengeResult> {
  const sdk = await getSdk(auth.appId ?? getCircleAppId())
  sdk.setAuthentication?.({
    userToken: auth.userToken,
    encryptionKey: auth.encryptionKey,
  })

  try {
    const result = await new Promise<unknown>((resolve, reject) => {
      try {
        const maybePromise = sdk.execute(challengeId, (error, value) => {
          if (error) reject(error)
          else resolve(value)
        })
        if (maybePromise && typeof (maybePromise as Promise<unknown>).then === 'function') {
          void (maybePromise as Promise<unknown>).then(resolve).catch(reject)
        }
      } catch (e) {
        reject(e)
      }
    })
    const parsed = resultToChallenge(result)
    if (parsed?.status === 'failed') {
      throw new Error(parsed.error || 'Circle challenge failed.')
    }
    return parsed ?? { status: 'complete' }
  } catch (e) {
    if (isCircleUserRejectedError(e)) throw new CircleUserRejectedError()
    throw e
  }
}

export function resetCircleSdk() {
  sdkPromise = null
  pendingLoginResolver = null
}

export function isSocialCircleAuthMethod(method: CircleAuthMethod): method is SocialProvider {
  return method === 'google' || method === 'apple' || method === 'facebook'
}
