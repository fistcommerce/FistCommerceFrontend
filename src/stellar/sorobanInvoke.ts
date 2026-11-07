import { getSorobanDeployment } from '@/stellar/deployment'
import {
  classifySorobanErrorText,
  stringifySorobanFailure,
} from '@/stellar/contractErrors'
import { createSorobanServer, stellarNetworkPassphrase } from '@/stellar/rpcClient'
import { initAndGetKit } from '@/stellar/walletsKit'

function rethrowSoroban(error: unknown, method: string): never {
  const raw = stringifySorobanFailure(error)
  const classified = classifySorobanErrorText(raw)
  if (classified) {
    throw new Error(classified.message)
  }
  // Preserve wallet rejection / clear app Errors; only normalize opaque HostError blobs.
  if (error instanceof Error) {
    const msg = error.message.trim()
    if (
      msg &&
      !/HostError|Error\(Contract|simulateTransaction|ScErrorType/i.test(msg)
    ) {
      throw error
    }
    if (msg) throw new Error(msg.slice(0, 500))
  }
  const trimmed = raw.trim()
  if (trimmed) {
    throw new Error(`Soroban ${method} failed: ${trimmed.slice(0, 500)}`)
  }
  throw new Error(`Soroban ${method} failed.`)
}

export function randomOpIdBytes(): Uint8Array {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return bytes
}

export type ScParam =
  | { type: 'address'; value: string }
  | { type: 'string'; value: string }
  | { type: 'bool'; value: boolean }
  | { type: 'i128'; value: bigint }
  | { type: 'u64'; value: bigint | number }
  | { type: 'u32'; value: number }
  | { type: 'bytes'; value: Uint8Array }

function toScArgs(
  nativeToScVal: (typeof import('@stellar/stellar-sdk'))['nativeToScVal'],
  args: ScParam[],
) {
  return args.map((arg) => {
    switch (arg.type) {
      case 'address':
        return nativeToScVal(arg.value, { type: 'address' })
      case 'string':
        return nativeToScVal(arg.value, { type: 'string' })
      case 'bool':
        return nativeToScVal(arg.value, { type: 'bool' })
      case 'i128':
        return nativeToScVal(arg.value, { type: 'i128' })
      case 'u64':
        return nativeToScVal(BigInt(arg.value), { type: 'u64' })
      case 'u32':
        return nativeToScVal(arg.value, { type: 'u32' })
      case 'bytes':
        return nativeToScVal(arg.value)
      default:
        throw new Error('Unsupported Soroban argument type')
    }
  })
}

async function waitForSorobanTx(
  server: Awaited<ReturnType<typeof createSorobanServer>>,
  rpcApi: (typeof import('@stellar/stellar-sdk'))['rpc'],
  hash: string,
  method: string,
): Promise<{ hash: string }> {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1500))
    const got = await server.getTransaction(hash)
    if (got.status === rpcApi.Api.GetTransactionStatus.SUCCESS) {
      return { hash }
    }
    if (got.status === rpcApi.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Soroban transaction failed (${method}).`)
    }
  }
  throw new Error(`Timed out waiting for ${method} confirmation.`)
}

/**
 * Build, wallet-sign, submit, and wait for a Soroban contract invoke.
 */
export async function invokeSorobanWithWallet(params: {
  contractId: string
  method: string
  args: ScParam[]
  source: string
}): Promise<{ hash: string }> {
  const source = params.source.trim().toUpperCase()
  const {
    Account,
    Contract,
    TransactionBuilder,
    nativeToScVal,
    rpc,
  } = await import('@stellar/stellar-sdk')

  const server = await createSorobanServer()
  const contract = new Contract(params.contractId)
  const account = await server.getAccount(source)
  const scArgs = toScArgs(nativeToScVal, params.args)

  try {
    const tx = new TransactionBuilder(account as unknown as InstanceType<typeof Account>, {
      fee: '1000000',
      networkPassphrase: stellarNetworkPassphrase(),
    })
      .addOperation(contract.call(params.method, ...scArgs))
      .setTimeout(180)
      .build()

    const prepared = await server.prepareTransaction(tx)
    const { StellarWalletsKit, Networks } = await initAndGetKit()
    const { signedTxXdr } = await StellarWalletsKit.signTransaction(prepared.toXDR(), {
      address: source,
      networkPassphrase: Networks.TESTNET,
    })
    if (!signedTxXdr) throw new Error('Wallet did not return a signed transaction.')

    const signed = TransactionBuilder.fromXDR(signedTxXdr, stellarNetworkPassphrase())
    const send = await server.sendTransaction(signed)
    if (send.status === 'ERROR') {
      rethrowSoroban(send, params.method)
    }
    return await waitForSorobanTx(server, rpc, send.hash, params.method)
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Wallet did not return')) throw e
    rethrowSoroban(e, params.method)
  }
}

/**
 * Same invoke path as the wallet kit, but signed with a secret key (Node / test harness).
 */
export async function invokeSorobanWithSecret(params: {
  contractId: string
  method: string
  args: ScParam[]
  secret: string
}): Promise<{ hash: string }> {
  const {
    Account,
    Contract,
    Keypair,
    TransactionBuilder,
    nativeToScVal,
    rpc,
  } = await import('@stellar/stellar-sdk')
  const kp = Keypair.fromSecret(params.secret.trim())
  const source = kp.publicKey()
  const server = await createSorobanServer()
  const contract = new Contract(params.contractId)
  const account = await server.getAccount(source)
  const scArgs = toScArgs(nativeToScVal, params.args)

  try {
    const tx = new TransactionBuilder(account as unknown as InstanceType<typeof Account>, {
      fee: '1000000',
      networkPassphrase: stellarNetworkPassphrase(),
    })
      .addOperation(contract.call(params.method, ...scArgs))
      .setTimeout(180)
      .build()

    const prepared = await server.prepareTransaction(tx)
    prepared.sign(kp)
    const send = await server.sendTransaction(prepared)
    if (send.status === 'ERROR') {
      rethrowSoroban(send, params.method)
    }
    return await waitForSorobanTx(server, rpc, send.hash, params.method)
  } catch (e) {
    rethrowSoroban(e, params.method)
  }
}

export function tradeCreditPoolId(): string {
  return getSorobanDeployment().trade_credit_pool.contract_id
}

export function attestationRegistryId(): string {
  return getSorobanDeployment().attestation_registry.contract_id
}
