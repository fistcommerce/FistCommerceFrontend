/**
 * Context-matrix checks for governance vs user-tx error classification.
 * Run: npx --yes vite-node src/errors/runClassifyContextChecks.ts
 */
import { classifyAppError } from '@/errors/classify'
import { messageForCode } from '@/errors/messages'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function expectCode(
  raw: string,
  context: Parameters<typeof classifyAppError>[1],
  code: string,
) {
  const got = classifyAppError(raw, context)
  assert(
    got.code === code,
    `context=${context} raw=${JSON.stringify(raw)} → expected ${code}, got ${got.code} (${got.message})`,
  )
}

expectCode('AA25 invalid account nonce', 'governance_execute', 'MULTISIG_STALE_NONCE')
expectCode('AA25 invalid account nonce', 'withdraw', 'WALLET_NONCE_CONFLICT')
expectCode('AA25 invalid account nonce', 'invest', 'WALLET_NONCE_CONFLICT')
expectCode('Reconnect the wallet used for this session to invest.', 'invest', 'WALLET_NOT_CONNECTED')
expectCode('Connect your wallet to repay.', 'repay', 'WALLET_NOT_CONNECTED')
{
  const got = classifyAppError('Reconnect the wallet used for this session to invest.', 'invest')
  assert(
    got.message === 'Reconnect the wallet used for this session to invest.',
    `invest disconnect copy must be preserved, got ${got.message}`,
  )
}

expectCode('EntryPoint handleOps simulation failed', 'governance_execute', 'EXEC_SIM_FAILED')
expectCode('EntryPoint handleOps simulation failed', 'withdraw', 'UNKNOWN')

expectCode('queued at nonce 3; execute earlier proposals first', 'governance_execute', 'MULTISIG_EXECUTE_QUEUED')
// User lane ignores queue language → falls through; may be UNKNOWN
{
  const got = classifyAppError('queued at nonce 3; execute earlier proposals first', 'withdraw')
  assert(
    got.code !== 'MULTISIG_EXECUTE_QUEUED' && got.code !== 'MULTISIG_STALE_NONCE',
    `withdraw must not get multisig queue code, got ${got.code}`,
  )
}

expectCode('execution reverted: "illiquid"', 'withdraw', 'POOL_ILLIQUID')
expectCode('execution reverted: "inactive request"', 'withdraw', 'WITHDRAWAL_INACTIVE')
expectCode('execution reverted: "illiquid"', 'governance_execute', 'POOL_ILLIQUID')

expectCode(
  'Frozen UserOp nonce 12 is stale; on-chain nonce is 14',
  'governance_execute',
  'MULTISIG_STALE_NONCE',
)
expectCode(
  'Frozen UserOp nonce 12 is stale; on-chain nonce is 14',
  'withdraw',
  'WALLET_NONCE_CONFLICT',
)

{
  const msg = messageForCode('WALLET_NONCE_CONFLICT')
  assert(!/Restart signatures|owners sign/i.test(msg), 'wallet nonce message must not mention owners')
  const multi = messageForCode('MULTISIG_STALE_NONCE')
  assert(/Restart signatures/i.test(multi), 'multisig stale nonce should mention Restart signatures')
}

console.log('classify context checks OK')
