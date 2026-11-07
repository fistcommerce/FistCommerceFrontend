/**
 * ESM shim for `@stellar/freighter-api`.
 * The published package is a UMD/CJS bundle; Vite named imports (`getAddress`, etc.) fail.
 */
import * as freighterNs from '@stellar/freighter-api/build/index.min.js'

type FreighterApi = {
  getAddress: (...args: unknown[]) => Promise<unknown>
  getNetwork: (...args: unknown[]) => Promise<unknown>
  getNetworkDetails?: (...args: unknown[]) => Promise<unknown>
  isConnected: (...args: unknown[]) => Promise<unknown>
  isAllowed?: (...args: unknown[]) => Promise<unknown>
  requestAccess: (...args: unknown[]) => Promise<unknown>
  setAllowed?: (...args: unknown[]) => Promise<unknown>
  signAuthEntry: (...args: unknown[]) => Promise<unknown>
  signMessage: (...args: unknown[]) => Promise<unknown>
  signTransaction: (...args: unknown[]) => Promise<unknown>
  addToken?: (...args: unknown[]) => Promise<unknown>
  WatchWalletChanges?: unknown
  isBrowser?: boolean
}

function resolveApi(): FreighterApi {
  const ns = freighterNs as Record<string, unknown>
  const candidates = [ns, ns.default, ns.freighterApi, (ns.default as Record<string, unknown> | undefined)?.default]
  for (const candidate of candidates) {
    if (
      candidate &&
      typeof candidate === 'object' &&
      typeof (candidate as FreighterApi).getAddress === 'function'
    ) {
      return candidate as FreighterApi
    }
  }
  throw new Error('Could not resolve @stellar/freighter-api exports')
}

const api = resolveApi()

export const getAddress = api.getAddress.bind(api)
export const getNetwork = api.getNetwork.bind(api)
export const getNetworkDetails = (api.getNetworkDetails ?? api.getNetwork).bind(api)
export const isConnected = api.isConnected.bind(api)
export const isAllowed = (api.isAllowed ?? (async () => ({ isAllowed: false }))).bind(api)
export const requestAccess = api.requestAccess.bind(api)
export const setAllowed = (api.setAllowed ?? (async () => ({ isAllowed: false }))).bind(api)
export const signAuthEntry = api.signAuthEntry.bind(api)
export const signMessage = api.signMessage.bind(api)
export const signTransaction = api.signTransaction.bind(api)
export const addToken = (api.addToken ?? (async () => ({}))).bind(api)
export const WatchWalletChanges = api.WatchWalletChanges
export const isBrowser = api.isBrowser ?? typeof window !== 'undefined'

export default api
