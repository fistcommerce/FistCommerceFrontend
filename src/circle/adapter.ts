import { getAddress, type Address, type Hex } from 'viem'

import {
  getCircleChallenge,
  postCircleSendTransaction,
  postCircleSignTypedData,
} from '@/circle/api'
import { CircleUserRejectedError, isCircleUserRejectedError } from '@/circle/errors'
import { authenticateCircleSdk, executeCircleChallenge } from '@/circle/sdk'
import type { CircleLiveSession } from '@/circle/types'
import type { AppEthereumProvider, AppWallet } from '@/wallet/appWallet'
import { getAppChainById } from '@/wallet/appChain'
import { isUsableApiAccessToken } from '@/auth/accessTokenPolicy'
import { getAppStore } from '@/store/storeRef'

type Listener = (...args: unknown[]) => void

function hexChainId(chainId: number): Hex {
  return `0x${chainId.toString(16)}` as Hex
}

function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
}

function readFistAccessToken(): string | null {
  try {
    const token = (getAppStore()?.getState() as { auth?: { accessToken?: string | null } } | undefined)
      ?.auth?.accessToken
    return typeof token === 'string' && isUsableApiAccessToken(token) ? token : null
  } catch {
    return null
  }
}

async function runChallenge<T extends 'signature' | 'txHash'>(
  session: CircleLiveSession,
  challengeId: string,
  field: T,
): Promise<NonNullable<CircleLiveSession extends never ? never : string>> {
  await authenticateCircleSdk(session)
  const executed = await executeCircleChallenge(challengeId, session)
  const fromSdk = field === 'signature' ? executed.signature : executed.txHash
  if (fromSdk) return fromSdk

  const started = Date.now()
  while (Date.now() - started < 90_000) {
    const polled = await getCircleChallenge({
      challengeId,
      userToken: session.userToken,
      accessToken: readFistAccessToken(),
    })
    if (polled.status === 'failed') {
      throw new Error(polled.error || 'Circle challenge failed.')
    }
    const value = field === 'signature' ? polled.signature : polled.txHash
    if (polled.status === 'complete' && value) return value
    await new Promise((r) => window.setTimeout(r, 1000))
  }
  throw new Error('Circle Wallet timed out waiting for PIN confirmation.')
}

export type CircleProviderDeps = {
  getSession: () => CircleLiveSession
  switchChain: (chainId: number) => Promise<void>
  onDisconnect: () => Promise<void>
}

export function createCircleEthereumProvider(deps: CircleProviderDeps): AppEthereumProvider {
  const listeners = new Map<string, Set<Listener>>()

  const emit = (event: string, ...args: unknown[]) => {
    listeners.get(event)?.forEach((fn) => {
      try {
        fn(...args)
      } catch {
        /* ignore */
      }
    })
  }

  const provider: AppEthereumProvider = {
    on(event, listener) {
      const set = listeners.get(event) ?? new Set()
      set.add(listener)
      listeners.set(event, set)
    },
    removeListener(event, listener) {
      listeners.get(event)?.delete(listener)
    },
    async request({ method, params }) {
      const session = deps.getSession()
      try {
        switch (method) {
          case 'eth_chainId':
            return hexChainId(session.chainId)
          case 'eth_accounts':
          case 'eth_requestAccounts':
            return [session.address]
          case 'wallet_revokePermissions':
            return null
          case 'wallet_addEthereumChain':
            return null
          case 'wallet_switchEthereumChain': {
            const raw = Array.isArray(params) ? (params[0] as { chainId?: string } | undefined)?.chainId : undefined
            const next =
              typeof raw === 'string' && raw.startsWith('0x')
                ? Number.parseInt(raw, 16)
                : Number(raw)
            if (!Number.isFinite(next)) throw new Error('Invalid chain id.')
            const prevAddress = session.address
            const prevChain = session.chainId
            await deps.switchChain(Math.trunc(next))
            const after = deps.getSession()
            if (after.chainId !== prevChain) emit('chainChanged', hexChainId(after.chainId))
            if (after.address.toLowerCase() !== prevAddress.toLowerCase()) {
              emit('accountsChanged', [after.address])
            }
            return null
          }
          case 'eth_signTypedData_v4': {
            const list = Array.isArray(params) ? params : []
            const typedRaw = list[1] ?? list[0]
            const typedData = typeof typedRaw === 'string' ? JSON.parse(typedRaw) : typedRaw
            const { challengeId } = await postCircleSignTypedData({
              walletId: session.walletId,
              chainId: session.chainId,
              typedData,
              userToken: session.userToken,
              accessToken: readFistAccessToken(),
              idempotencyKey: newIdempotencyKey(),
            })
            return await runChallenge(session, challengeId, 'signature')
          }
          case 'eth_sendTransaction': {
            const tx = (Array.isArray(params) ? params[0] : params) as {
              to?: string
              data?: Hex
              value?: Hex
            }
            if (!tx?.to) throw new Error('Circle transaction is missing a contract address.')
            const { challengeId } = await postCircleSendTransaction({
              walletId: session.walletId,
              chainId: session.chainId,
              to: getAddress(tx.to as Address),
              data: tx.data,
              value: tx.value,
              userToken: session.userToken,
              accessToken: readFistAccessToken(),
              idempotencyKey: newIdempotencyKey(),
            })
            return await runChallenge(session, challengeId, 'txHash')
          }
          default:
            throw new Error(`Circle Wallet does not support ${method}.`)
        }
      } catch (e) {
        if (isCircleUserRejectedError(e)) throw new CircleUserRejectedError()
        throw e
      }
    },
  }

  return provider
}

export function createCircleAppWallet(deps: CircleProviderDeps): AppWallet {
  const provider = createCircleEthereumProvider(deps)
  return {
    get address() {
      return deps.getSession().address
    },
    walletClientType: 'circle',
    source: 'circle',
    getEthereumProvider: async () => provider,
    disconnect: deps.onDisconnect,
  }
}

export function circleChainName(chainId: number): string {
  return getAppChainById(chainId)?.name ?? `chain ${chainId}`
}
