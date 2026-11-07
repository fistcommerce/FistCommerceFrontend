import { getSorobanDeployment } from '@/stellar/deployment'
import { createSorobanServer, stellarNetworkPassphrase } from '@/stellar/rpcClient'
import {
  STELLAR_TEST_ASSET_CODE,
  STELLAR_TEST_ASSET_ISSUER,
  STELLAR_TESTNET_HORIZON_URL,
} from '@/stellar/testAsset'

const FISTUSD_DECIMALS = 7

export function fistUsdFromStroops(stroops: bigint | number | string): number {
  const n = typeof stroops === 'bigint' ? stroops : BigInt(stroops)
  return Number(n) / 10 ** FISTUSD_DECIMALS
}

export function fistUsdToStroops(human: number): bigint {
  if (!Number.isFinite(human) || human <= 0) return 0n
  return BigInt(Math.round(human * 10 ** FISTUSD_DECIMALS))
}

/** Classic Horizon balance for FISTUSD (human units). */
export async function fetchFistUsdClassicBalance(address: string): Promise<number> {
  const dest = address.trim().toUpperCase()
  const res = await fetch(
    `${STELLAR_TESTNET_HORIZON_URL}/accounts/${encodeURIComponent(dest)}`,
  )
  if (res.status === 404) return 0
  if (!res.ok) throw new Error(`Horizon account lookup failed (${res.status})`)
  const body = (await res.json()) as {
    balances?: Array<{
      asset_type?: string
      asset_code?: string
      asset_issuer?: string
      balance?: string
    }>
  }
  for (const bal of body.balances || []) {
    if (
      bal.asset_code === STELLAR_TEST_ASSET_CODE &&
      (bal.asset_issuer || '').toUpperCase() === STELLAR_TEST_ASSET_ISSUER
    ) {
      const n = Number(bal.balance)
      return Number.isFinite(n) ? n : 0
    }
  }
  return 0
}

async function simulatePoolCall(fn: string, params: unknown[]) {
  const {
    Account,
    Contract,
    Keypair,
    TransactionBuilder,
    nativeToScVal,
    scValToNative,
    rpc,
  } = await import('@stellar/stellar-sdk')
  const dep = getSorobanDeployment()
  const server = await createSorobanServer()
  const pool = new Contract(dep.trade_credit_pool.contract_id)
  const simAccount = Keypair.random().publicKey()
  const scParams = params.map((p) => {
    if (typeof p === 'string' && p.startsWith('G')) {
      return nativeToScVal(p, { type: 'address' })
    }
    if (typeof p === 'string') return nativeToScVal(p, { type: 'string' })
    if (typeof p === 'boolean') return nativeToScVal(p, { type: 'bool' })
    if (typeof p === 'bigint') return nativeToScVal(p, { type: 'i128' })
    return nativeToScVal(p as never)
  })
  const tx = new TransactionBuilder(new Account(simAccount, '0'), {
    fee: '100000',
    networkPassphrase: stellarNetworkPassphrase(),
  })
    .addOperation(pool.call(fn, ...scParams))
    .setTimeout(30)
    .build()
  const sim = await server.simulateTransaction(tx)
  if (!rpc.Api.isSimulationSuccess(sim)) {
    const err =
      'error' in sim
        ? JSON.stringify((sim as { error?: unknown }).error)
        : 'simulation failed'
    throw new Error(`Soroban ${fn} failed: ${err}`)
  }
  const retval = sim.result?.retval
  if (!retval) return null
  return scValToNative(retval)
}

/** Investor pool units (1:1 with deposited FISTUSD stroops on Track A). */
export async function fetchInvestorPoolUnits(investor: string): Promise<bigint> {
  const raw = await simulatePoolCall('get_investor_units', [investor.trim().toUpperCase()])
  if (raw == null) return 0n
  if (typeof raw === 'bigint') return raw
  if (typeof raw === 'number') return BigInt(Math.trunc(raw))
  if (typeof raw === 'string') return BigInt(raw)
  return 0n
}

export async function fetchPoolAccounting(): Promise<unknown> {
  return simulatePoolCall('get_pool_accounting', [])
}

export function formatUsdDisplay(human: number | null | undefined): string {
  if (human == null || !Number.isFinite(human)) return '—'
  return human.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
