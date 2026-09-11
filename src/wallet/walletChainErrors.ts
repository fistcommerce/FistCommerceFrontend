import { isCircleUserRejectedError } from '@/circle/errors'

export function eip1193ErrorCode(e: unknown): number | undefined {
  if (e && typeof e === 'object' && 'code' in e) {
    const c = (e as { code?: unknown }).code
    if (typeof c === 'number') return c
  }
  return undefined
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return ''
}

/** EIP-1193 user rejection (network switch, add chain, sign, etc.). */
export function isUserRejectedWalletRequest(e: unknown): boolean {
  if (eip1193ErrorCode(e) === 4001) return true
  if (e instanceof Error && e.name === 'UserRejectedRequestError') return true
  if (e instanceof Error && e.name === 'CircleUserRejectedError') return true
  if (isCircleUserRejectedError(e)) return true
  return /user rejected|denied transaction|request rejected|action rejected|cancelled the circle|pin.*(cancel|closed)/i.test(
    errorMessage(e),
  )
}

/** Whether a failed `wallet_switchEthereumChain` likely means the chain is not in the wallet yet. */
export function shouldTryAddEthereumChain(e: unknown): boolean {
  if (eip1193ErrorCode(e) === 4902) return true
  return /unrecognized chain|unknown chain|not added|chain not configured|not supported|4902|chain id/i.test(
    errorMessage(e),
  )
}

/** Some wallets reject add when the chain already exists — safe to continue to switch. */
export function isChainAlreadyAddedError(e: unknown): boolean {
  return /already (added|exists|configured)|chain already/i.test(errorMessage(e))
}

export class WalletChainSwitchError extends Error {
  readonly userRejected: boolean
  readonly causeError: unknown

  constructor(message: string, causeError: unknown, userRejected = false) {
    super(message)
    this.name = 'WalletChainSwitchError'
    this.userRejected = userRejected
    this.causeError = causeError
  }
}

export function formatWalletChainSwitchError(err: unknown, chainName: string): string {
  if (err instanceof WalletChainSwitchError) return err.message
  if (isUserRejectedWalletRequest(err)) {
    return `Network switch to ${chainName} was cancelled. Approve the prompt in your wallet app.`
  }
  if (/circle/i.test(errorMessage(err))) {
    return `Could not switch Circle Wallet to ${chainName}. Circle uses a different address on each network.`
  }
  return `Could not switch to ${chainName}. Try the manual steps below or enable testnets in your wallet settings.`
}
