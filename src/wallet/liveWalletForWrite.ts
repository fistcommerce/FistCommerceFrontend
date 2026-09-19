import type { AppWallet } from '@/wallet/appWallet'

export type LiveWalletWriteAction = 'invest' | 'repay' | 'continue'

export type LiveWalletSnapshot = {
  ready: boolean
  wallet: AppWallet | null | undefined
  address: string | null | undefined
}

export type LiveWalletForWrite =
  | { status: 'booting' }
  | { status: 'disconnected'; message: string }
  | { status: 'ready'; wallet: AppWallet; address: string }

const DISCONNECTED_RE =
  /connect your wallet to (invest|repay|continue)|reconnect the wallet used for this session/i

export function sameLiveWalletAddress(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = a?.trim().toLowerCase() ?? ''
  const right = b?.trim().toLowerCase() ?? ''
  return Boolean(left) && left === right
}

export function liveWalletDisconnectedMessage(action: LiveWalletWriteAction): string {
  if (action === 'invest') return 'Reconnect the wallet used for this session to invest.'
  if (action === 'repay') return 'Reconnect the wallet used for this session to repay.'
  return 'Reconnect the wallet used for this session to continue.'
}

export function sessionWalletMismatchMessage(): string {
  return 'That wallet does not match this session. Reconnect the wallet you used to sign in.'
}

export function isLiveWalletDisconnectedMessage(message: string | null | undefined): boolean {
  const text = message?.trim() ?? ''
  if (!text) return false
  return DISCONNECTED_RE.test(text) || /that wallet does not match this session/i.test(text)
}

export function resolveLiveWalletForWrite(
  snap: LiveWalletSnapshot,
  action: LiveWalletWriteAction = 'continue',
): LiveWalletForWrite {
  const address = snap.address?.trim() || null
  if (snap.wallet && address) {
    return { status: 'ready', wallet: snap.wallet, address }
  }
  if (!snap.ready) return { status: 'booting' }
  return { status: 'disconnected', message: liveWalletDisconnectedMessage(action) }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

/**
 * Wait while providers are still restoring. Returns immediately when ready+connected
 * or when restore finished with no signer (reconnect required).
 */
export async function waitForLiveWallet(
  getSnapshot: () => LiveWalletSnapshot,
  options?: {
    action?: LiveWalletWriteAction
    timeoutMs?: number
    intervalMs?: number
    sleep?: (ms: number) => Promise<void>
  },
): Promise<LiveWalletForWrite> {
  const action = options?.action ?? 'continue'
  const timeoutMs = options?.timeoutMs ?? 8_000
  const intervalMs = options?.intervalMs ?? 150
  const sleep = options?.sleep ?? defaultSleep
  const started = Date.now()

  while (true) {
    const resolved = resolveLiveWalletForWrite(getSnapshot(), action)
    if (resolved.status !== 'booting') return resolved
    if (Date.now() - started >= timeoutMs) {
      return { status: 'disconnected', message: liveWalletDisconnectedMessage(action) }
    }
    await sleep(intervalMs)
  }
}
