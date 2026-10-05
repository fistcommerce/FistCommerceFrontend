/**
 * Public Circle integration surface.
 *
 * Programmable Wallets (user-controlled EOA) and CCTP hop chain mapping live here.
 * Import from `@/circle` instead of reaching into SDK or storage internals.
 */
export { CircleWalletProvider, useCircleWallet } from './CircleWalletProvider'
export {
  createCircleAppWallet,
  createCircleEthereumProvider,
  circleChainName,
} from './adapter'
export {
  circleEnsureChallengeId,
  getCircleChallenge,
  postCircleAuthComplete,
  postCircleEmailToken,
  postCircleEnsureWallet,
  postCircleSendTransaction,
  postCircleSession,
  postCircleSessionRefresh,
  postCircleSignTypedData,
  postCircleSocialToken,
  postCircleUserTokenRefresh,
} from './api'
export type { CircleWalletCreationRequiredError } from './api'
export {
  authenticateCircleSdk,
  awaitCircleSocialLoginReturn,
  executeCircleChallenge,
  getCircleSdkDeviceId,
  isSocialCircleAuthMethod,
  performCircleEmailOtpLogin,
  performCircleSocialLogin,
  resetCircleSdk,
} from './sdk'
export {
  circleWalletUnavailableReason,
  getCircleAppId,
  isCircleAuthMethodConfigured,
  isCircleWalletEnabled,
} from './enabled'
export {
  circleBlockchainFromChainId,
  getCircleSwitchChainById,
  isCircleHopChainId,
  isCircleLoginChainId,
  isCircleSupportedChainId,
} from './chainMap'
export type {
  CircleAuthMethod,
  CircleConnectOptions,
  CircleLiveSession,
  CircleWalletRecord,
} from './types'
export { CircleUserRejectedError, isCircleUserRejectedError } from './errors'
export { default as CircleConnectPanel } from './CircleConnectPanel'
