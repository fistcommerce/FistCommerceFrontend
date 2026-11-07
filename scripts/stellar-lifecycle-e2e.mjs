#!/usr/bin/env node
/**
 * Full TradeCreditPool lifecycle on Stellar Testnet using the same deploy as the FE.
 * Requires env: STELLAR_ADMIN_SECRET, INV_S, MER_S (and matching INV_G / MER_G).
 */
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  Account,
  Contract,
  Keypair,
  nativeToScVal,
  Networks,
  rpc,
  scValToNative,
  TransactionBuilder,
} from '@stellar/stellar-sdk'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dep = JSON.parse(
  readFileSync(resolve(__dirname, '../src/stellar/testnet.deployment.json'), 'utf8'),
)
const RPC = process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org'
const PASSPHRASE = dep.network_passphrase || Networks.TESTNET
const POOL = dep.trade_credit_pool.contract_id
const REGISTRY = dep.attestation_registry.contract_id

const admin = Keypair.fromSecret(process.env.STELLAR_ADMIN_SECRET)
const issuer = Keypair.fromSecret(process.env.STELLAR_ISSUER_SECRET)
const investor = Keypair.fromSecret(process.env.INV_S)
const merchant = Keypair.fromSecret(process.env.MER_S)
const server = new rpc.Server(RPC, { allowHttp: RPC.startsWith('http://') })
const pool = new Contract(POOL)
const registry = new Contract(REGISTRY)

function opId() {
  return randomBytes(32)
}

function stroops(human) {
  return BigInt(Math.round(Number(human) * 1e7))
}

function subjectHex(merchantId) {
  return createHash('sha256').update(merchantId, 'utf8').digest()
}

async function invoke(kp, contract, method, scArgs) {
  const account = await server.getAccount(kp.publicKey())
  const tx = new TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(contract.call(method, ...scArgs))
    .setTimeout(180)
    .build()
  const prepared = await server.prepareTransaction(tx)
  prepared.sign(kp)
  const send = await server.sendTransaction(prepared)
  if (send.status === 'ERROR') {
    throw new Error(`${method} submit ERROR: ${JSON.stringify(send)}`)
  }
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1500))
    const got = await server.getTransaction(send.hash)
    if (got.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      console.log(`OK ${method}`, send.hash)
      return send.hash
    }
    if (got.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`${method} FAILED: ${JSON.stringify(got)}`)
    }
  }
  throw new Error(`${method} timeout ${send.hash}`)
}

async function simulate(contract, method, scArgs) {
  const simAccount = Keypair.random().publicKey()
  const tx = new TransactionBuilder(new Account(simAccount, '0'), {
    fee: '100000',
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(contract.call(method, ...scArgs))
    .setTimeout(30)
    .build()
  const sim = await server.simulateTransaction(tx)
  if (!rpc.Api.isSimulationSuccess(sim)) {
    throw new Error(`sim ${method} failed: ${JSON.stringify(sim)}`)
  }
  return sim.result?.retval ? scValToNative(sim.result.retval) : null
}

async function expectFail(kp, contract, method, scArgs, label) {
  try {
    await invoke(kp, contract, method, scArgs)
    throw new Error(`${label}: expected failure but succeeded`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('expected failure')) throw e
    console.log(`OK reject/fail path (${label}):`, msg.slice(0, 180))
  }
}

const results = {}

async function main() {
  console.log('admin', admin.publicKey())
  console.log('issuer', issuer.publicKey())
  console.log('investor', investor.publicKey())
  console.log('merchant', merchant.publicKey())

  const beforeUnits = await simulate(pool, 'get_investor_units', [
    nativeToScVal(investor.publicKey(), { type: 'address' }),
  ])
  console.log('units before', String(beforeUnits))

  // 1) Invest (deposit)
  results.deposit = await invoke(investor, pool, 'deposit', [
    nativeToScVal(investor.publicKey(), { type: 'address' }),
    nativeToScVal(stroops(100), { type: 'i128' }),
    nativeToScVal(opId()),
  ])

  // 2) Withdraw (redeem) — leave prior position intact minus this partial
  results.redeem = await invoke(investor, pool, 'redeem', [
    nativeToScVal(investor.publicKey(), { type: 'address' }),
    nativeToScVal(stroops(50), { type: 'i128' }),
    nativeToScVal(opId()),
  ])

  const rid = `FIST-E2E-${Date.now()}`
  const merchantId = `MERCHANT-E2E-${Date.now()}`
  const maturity = Math.floor(Date.now() / 1000) + 86400 * 30
  const advance = stroops(200)
  const repayment = stroops(210)

  // 3) Loan request (register receivable) — admin = originator
  results.register = await invoke(admin, pool, 'register_receivable', [
    nativeToScVal(rid, { type: 'string' }),
    nativeToScVal(merchantId, { type: 'string' }),
    nativeToScVal(merchant.publicKey(), { type: 'address' }),
    nativeToScVal(advance, { type: 'i128' }),
    nativeToScVal(repayment, { type: 'i128' }),
    nativeToScVal(BigInt(maturity), { type: 'u64' }),
  ])

  // 4a) Rejection path — fund before approve/attest must fail
  await expectFail(
    admin,
    pool,
    'fund_receivable',
    [nativeToScVal(rid, { type: 'string' }), nativeToScVal(opId())],
    'fund before approve',
  )

  // 4) Approval
  results.approve = await invoke(admin, pool, 'approve_receivable', [
    nativeToScVal(rid, { type: 'string' }),
  ])

  // 4b) Still reject fund without dual attestation
  await expectFail(
    admin,
    pool,
    'fund_receivable',
    [nativeToScVal(rid, { type: 'string' }), nativeToScVal(opId())],
    'fund without attestation',
  )

  const subject = subjectHex(merchantId)
  const evidence = randomBytes(32)
  const expires = Math.floor(Date.now() / 1000) + 86400 * 365

  // Attestations required before funding / payout
  // Authorized issuer is the FISTUSD issuer account (see setup-testnet.sh).
  results.attest1 = await invoke(issuer, registry, 'issue_attestation', [
    nativeToScVal(issuer.publicKey(), { type: 'address' }),
    nativeToScVal(subject),
    nativeToScVal(1, { type: 'u32' }),
    nativeToScVal(evidence),
    nativeToScVal(BigInt(expires), { type: 'u64' }),
  ])
  results.attest2 = await invoke(issuer, registry, 'issue_attestation', [
    nativeToScVal(issuer.publicKey(), { type: 'address' }),
    nativeToScVal(subject),
    nativeToScVal(2, { type: 'u32' }),
    nativeToScVal(randomBytes(32)),
    nativeToScVal(BigInt(expires), { type: 'u64' }),
  ])

  // 5) Fund (+ on-chain payout to merchant)
  results.fund = await invoke(admin, pool, 'fund_receivable', [
    nativeToScVal(rid, { type: 'string' }),
    nativeToScVal(opId()),
  ])

  // 6) Repay (merchant)
  results.repay = await invoke(merchant, pool, 'repay', [
    nativeToScVal(rid, { type: 'string' }),
    nativeToScVal(merchant.publicKey(), { type: 'address' }),
    nativeToScVal(repayment, { type: 'i128' }),
    nativeToScVal(opId()),
  ])

  const rec = await simulate(pool, 'get_receivable', [nativeToScVal(rid, { type: 'string' })])
  const unitsAfter = await simulate(pool, 'get_investor_units', [
    nativeToScVal(investor.publicKey(), { type: 'address' }),
  ])
  const accounting = await simulate(pool, 'get_pool_accounting', [])

  console.log('\n=== LIFECYCLE SUMMARY ===')
  console.log(
    JSON.stringify(
      { receivableId: rid, merchantId, results, rec, unitsAfter: String(unitsAfter), accounting },
      (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
      2,
    ),
  )
  console.log('ALL_STEPS_OK')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
