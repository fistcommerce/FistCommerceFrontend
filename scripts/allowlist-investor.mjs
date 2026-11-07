#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  Contract,
  Keypair,
  nativeToScVal,
  Networks,
  rpc,
  TransactionBuilder,
} from '@stellar/stellar-sdk'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dep = JSON.parse(
  readFileSync(resolve(__dirname, '../src/stellar/testnet.deployment.json'), 'utf8'),
)

const investor = (
  process.argv[2] || 'GAANM3ZQHDGX4NNAGQWGBSZF7JWRVLF7C4HZJXB2JC63WEOKA4NGLAVS'
)
  .trim()
  .toUpperCase()

const RPC =
  process.env.STELLAR_RPC_URL ||
  process.env.STELLAR_TESTNET_RPC_URL ||
  'https://soroban-testnet.stellar.org'

if (!process.env.STELLAR_ADMIN_SECRET) {
  console.error('STELLAR_ADMIN_SECRET required')
  process.exit(1)
}

const admin = Keypair.fromSecret(process.env.STELLAR_ADMIN_SECRET)
console.log('admin', admin.publicKey())
console.log('investor', investor)
console.log('rpc', RPC)

const server = new rpc.Server(RPC, { allowHttp: RPC.startsWith('http://') })
const pool = new Contract(dep.trade_credit_pool.contract_id)

const account = await server.getAccount(admin.publicKey())
const tx = new TransactionBuilder(account, {
  fee: '1000000',
  networkPassphrase: dep.network_passphrase || Networks.TESTNET,
})
  .addOperation(
    pool.call(
      'set_investor_status',
      nativeToScVal(investor, { type: 'address' }),
      nativeToScVal(true, { type: 'bool' }),
    ),
  )
  .setTimeout(180)
  .build()

const prepared = await server.prepareTransaction(tx)
prepared.sign(admin)
const send = await server.sendTransaction(prepared)
console.log('send', send.status, send.hash)
if (send.status === 'ERROR') {
  console.error(JSON.stringify(send, null, 2))
  process.exit(1)
}

for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 1500))
  const got = await server.getTransaction(send.hash)
  if (got.status === rpc.Api.GetTransactionStatus.SUCCESS) {
    console.log('OK allowlisted', investor)
    console.log('tx', send.hash)
    process.exit(0)
  }
  if (got.status === rpc.Api.GetTransactionStatus.FAILED) {
    console.error('FAILED', JSON.stringify(got))
    process.exit(1)
  }
}

console.error('timeout', send.hash)
process.exit(1)
