import type { AppErrorCode } from '@/errors/codes'

const MESSAGES: Record<AppErrorCode, string> = {
  AUTH_REQUIRED: 'Sign in again to continue.',
  API_UNAUTHORIZED: 'Your session expired. Sign in again.',
  API_FORBIDDEN: 'You don’t have permission for this action.',
  API_NOT_FOUND: 'We couldn’t find that resource. Refresh and try again.',
  API_VALIDATION: 'Please correct the highlighted fields and try again.',
  API_CONFLICT: 'This action conflicts with the current state. Refresh and try again.',
  API_SERVER: 'Something went wrong on the server. Try again in a moment.',
  API_NETWORK: 'Check your connection and try again.',
  API_MESSAGE: 'Something went wrong. Please try again.',
  WALLET_NOT_CONNECTED: 'Connect your wallet to continue.',
  WALLET_REJECTED: 'You cancelled the request in your wallet. Try again when you are ready.',
  WALLET_NONCE_CONFLICT:
    'Couldn’t send the transaction (wallet nonce conflict). Wait a moment, then try again.',
  WRONG_NETWORK: 'Switch your wallet to the correct network to continue.',
  CHAIN_SWITCH_REJECTED: 'Network switch was cancelled. Approve the prompt in your wallet.',
  CHAIN_SWITCH_FAILED:
    'Couldn’t switch networks. Enable the network in your wallet settings and try again.',
  INSUFFICIENT_NATIVE:
    'Your wallet does not have enough native token on this network to pay the transaction fee.',
  SERVICER_INSUFFICIENT_NATIVE:
    'The protocol servicer wallet does not have enough native token to submit this on-chain action. Please try again later or contact support.',
  GAS_PRICE_STALE: 'Network gas price moved before your transaction was sent. Please try again.',
  ALLOWANCE_REQUIRED: 'Approve token spending in your wallet, then try again.',
  INSUFFICIENT_TOKEN: 'Insufficient token balance for this amount.',
  TX_REVERTED: 'The transaction failed on-chain. Try again or contact support.',
  CONTRACT_REVERT: 'The transaction was rejected by the contract. Try again or contact support.',
  SIGN_PAYLOAD_MISSING:
    'Signing data from the server is incomplete. Refresh the proposal or contact ops.',
  SIGN_PAYLOAD_MISMATCH:
    'Signing data doesn’t match this proposal. Don’t sign — refresh or contact ops.',
  SIGN_TYPED_DATA_FAILED:
    'Your wallet couldn’t sign the approval. Unlock the wallet, confirm the network, and try again.',
  EXEC_PAYLOAD_ERROR: 'Execution could not be prepared. Refresh the proposal or contact ops.',
  EXEC_PAYLOAD_MALFORMED:
    'Execution data from the server is incomplete. Refresh the proposal or contact ops.',
  EXEC_SIM_AA24:
    'On-chain signature check failed (AA24). Owner signatures may be invalid or the proposal changed. Contact ops before retrying.',
  EXEC_SIM_FAILED:
    'Execution simulation failed. Contact ops with this proposal id before retrying.',
  EXEC_TX_REVERTED: 'On-chain execution reverted. Contact ops with the transaction details.',
  EXEC_CONFIRM_FAILED:
    'The transaction may have succeeded on-chain, but the server couldn’t confirm it. Share the transaction hash with ops.',
  EXEC_CONFIRM_PENDING:
    'The transaction mined on-chain, but confirmation is still pending. Tap Confirm transaction — do not submit a new one.',
  MULTISIG_ALREADY_EXECUTED_ON_CHAIN:
    'This proposal already succeeded on-chain. Refresh the page — do not submit another transaction.',
  MULTISIG_EXECUTE_IN_PROGRESS:
    'Another multisig execution is still in progress. Wait a few seconds and try again.',
  MULTISIG_EXECUTE_QUEUED:
    'This proposal is queued behind earlier ones. Execute those proposals first, then try again.',
  EXECUTE_QUEUE_JUMP_ACK_REQUIRED:
    'This proposal is not at the live on-chain nonce. Confirm queue jump to continue.',
  MULTISIG_RESIGN_REQUIRED:
    'Queue jump prepared. All owners must sign again before executing on-chain.',
  MULTISIG_STALE_NONCE:
    'This proposal’s on-chain nonce was bypassed. Use Restart signatures, then have all owners sign again.',
  SESSION_WALLET_MISMATCH: 'Reconnect the wallet used for this admin login.',
  NOT_MULTISIG_OWNER: 'Connected wallet is not a multisig owner for this deployment.',
  PROTOCOL_PAUSED: 'The protocol is temporarily paused. Try again later.',
  DEPOSITS_PAUSED: 'Deposits are temporarily paused. Try again later.',
  WITHDRAWALS_PAUSED: 'Withdrawals are temporarily paused. Try again later.',
  FUNDING_PAUSED: 'New funding and loan requests are temporarily paused. Try again later.',
  POOL_ILLIQUID:
    'The funding pool does not have enough liquid funds right now. Try again later.',
  WITHDRAWAL_INACTIVE:
    'This withdrawal can’t be claimed (expired, already claimed, or not approved). Refresh the list.',
  MERCHANT_CONCENTRATION:
    'This loan would exceed the pool’s max merchant concentration limit. Try a smaller amount or contact support.',
  KYC_REQUIRED: 'Finish identity verification before continuing.',
  CIRCLE_ARC_GAS:
    'Fund this Circle wallet with Arc Testnet USDC for gas (Circle faucet), then mint or deposit pool tokens here.',
  PAYOUT_NOT_CONFIRMED_ON_CHAIN:
    'The disbursement transaction was submitted, but on-chain payout is not confirmed yet. Status was left unchanged — verify the tx on a block explorer and retry if needed.',
  FUND_NOT_CONFIRMED_ON_CHAIN:
    'The funding transaction was submitted, but on-chain funding is not confirmed yet. Status was left unchanged — verify the tx and retry if needed.',
  REJECT_NOT_CONFIRMED_ON_CHAIN:
    'The cancel-funded transaction was submitted, but on-chain rejection is not confirmed yet. Status was left unchanged — verify the tx and retry if needed.',
  REPAYMENT_NOT_CONFIRMED_ON_CHAIN:
    'The repayment transaction was submitted, but on-chain repayment is not confirmed yet. Status was left unchanged — verify the tx and retry if needed.',
  UNKNOWN: 'Something went wrong. Please try again.',
}

export function messageForCode(code: AppErrorCode): string {
  return MESSAGES[code]
}
