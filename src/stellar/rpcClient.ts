import { getSorobanDeployment } from '@/stellar/deployment'

const DEFAULT_RPC =
  (import.meta.env.VITE_STELLAR_RPC_URL as string | undefined)?.trim() ||
  (import.meta.env.VITE_SOROBAN_RPC_URL as string | undefined)?.trim() ||
  'https://soroban-testnet.stellar.org'

export function stellarRpcUrl(): string {
  return DEFAULT_RPC
}

export async function createSorobanServer() {
  const { rpc } = await import('@stellar/stellar-sdk')
  const url = stellarRpcUrl()
  return new rpc.Server(url, { allowHttp: url.startsWith('http://') })
}

export function stellarNetworkPassphrase(): string {
  return getSorobanDeployment().network_passphrase
}
