import type { Address, Hash, Hex } from 'viem'

export type CircleAccountType = 'EOA' | 'SCA' | string

/** Circle-documented auth mediums (each maps to a distinct Circle user). */
export type CircleAuthMethod = 'google' | 'apple' | 'facebook' | 'email' | 'pin'

export type CircleWalletRecord = {
  walletId: string
  address: Address
  chainId: number
  accountType: CircleAccountType
  blockchain: string
}

export type CircleSessionResponse = {
  userToken: string
  encryptionKey: string
  appId: string
  challengeId: string | null
  wallet: CircleWalletRecord | null
  refreshToken?: string | null
  authMethod?: CircleAuthMethod | string | null
  circleUserId?: string | null
}

export type CircleDeviceTokenResponse = {
  deviceToken: string
  deviceEncryptionKey: string
  appId: string
  otpToken?: string
  email?: string
}

export type CircleAuthCompleteResponse = {
  appId: string
  challengeId: string | null
  wallet: CircleWalletRecord | null
  chainId: number
  circleUserId?: string | null
  authMethod?: string | null
}

export type CircleChallengeStatus = 'pending' | 'complete' | 'failed'

export type CircleChallengeResult = {
  status: CircleChallengeStatus
  signature?: Hex | null
  txHash?: Hash | null
  error?: string | null
}

export type CircleWalletRef = {
  walletId: string
  address: Address
  chainId: number
}

export type CircleSecretBundle = {
  userToken: string
  encryptionKey: string
  appId: string
  refreshToken?: string | null
}

export type CircleLiveSession = CircleSecretBundle &
  CircleWalletRef & {
    authMethod?: CircleAuthMethod | string | null
  }

export type CircleConnectOptions = {
  /** Required for email OTP */
  email?: string
  /** Required for PIN (Circle userId, 5–50 chars) — recovery key if cache is cleared */
  pinUserId?: string
}
