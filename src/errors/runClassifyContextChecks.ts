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

const hostInvestorNotApproved = `HostError: Error(Contract, #4)

Event log (newest first):
   0: [Diagnostic Event] contract:CABUICVVHPHD5BF5J3ID3BH4OJMTEKPQQKOPHRKQYRKER3MAFDS4T43V, topics:[error, Error(Contract, #4)], data:"escalating Ok(ScErrorType::Contract) frame-exit to Err"
   1: [Diagnostic Event] topics:[fn_call, CABUICVVHPHD5BF5J3ID3BH4OJMTEKPQQKOPHRKQYRKER3MAFDS4T43V, deposit], data:[GAANM3ZQHDGX4NNAGQWGBSZF7JWRVLF7C4HZJXB2JC63WEOKA4NGLAVS, 25000000000, Bytes(c39be47f95ab5650bf99b3958d6089297ec2122296de3b19095ffdf5c3ae4cb4)]
`

expectCode(hostInvestorNotApproved, 'invest', 'STELLAR_INVESTOR_NOT_APPROVED')
{
  const got = classifyAppError(hostInvestorNotApproved, 'invest')
  assert(
    /not approved to invest/i.test(got.message),
    `invest #4 message should mention allowlist, got ${got.message}`,
  )
}

expectCode(
  'HostError: Error(Contract, #13)\nfn_call, CABUICVVHPHD5BF5J3ID3BH4OJMTEKPQQKOPHRKQYRKER3MAFDS4T43V, fund_receivable',
  'invest',
  'POOL_ILLIQUID',
)

expectCode(
  'HostError: Error(Contract, #12)\nfn_call, CABUICVVHPHD5BF5J3ID3BH4OJMTEKPQQKOPHRKQYRKER3MAFDS4T43V, fund_receivable',
  'general',
  'STELLAR_ATTESTATION_MISSING',
)

expectCode(
  'HostError: Error(Contract, #4)\nfn_call, CDALKH7ZYF2EAWBVUIVLXUNKVXTGWJY5VLVFIVOB2LGPEH6OFGJD4VOM, issue_attestation',
  'general',
  'STELLAR_ISSUER_NOT_AUTHORIZED',
)

expectCode(
  'HostError: Error(Contract, #14)\nfn_call, CABUICVVHPHD5BF5J3ID3BH4OJMTEKPQQKOPHRKQYRKER3MAFDS4T43V, repay',
  'repay',
  'STELLAR_OVER_REPAYMENT',
)

console.log('classify context checks OK')
