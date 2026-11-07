import { useCallback, useState } from 'react'
import type { Abi, Address, Hex } from 'viem'

import { toAppUserFacingError } from '@/errors/toAppUserFacingError'
import { ApiRequestError, blockingProposalIdsFromApiError } from '@/api/apiRequestError'
import type { AppErrorCode } from '@/errors/codes'
import {
  fetchMultisigExecutionPayload,
  postMultisigProposalConfirmExecute,
  postMultisigProposalExecute,
} from '@/api/multisig/proposals'
import { isStellarChainId } from '@/stellar/chain'
import type { ExecuteProposalResult } from '@/api/types/multisig'
import {
  isGovernanceSignerAddress,
  resolveGovernanceActorAddress,
} from '@/admin/governance/governanceSigner'
import { userOpSuccessFromHandleOpsReceipt } from '@/admin/governance/userOpReceipt'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  clearAdminMultisigActionError,
  refreshMultisigConfig,
  refreshMultisigProposalDetail,
} from '@/store/slices/adminMultisigSlice'
import {
  clearMultisigPendingExecute,
  getMultisigPendingExecute,
  setMultisigPendingExecute,
} from '@/session/multisigPendingExecute'
import { DEFAULT_APP_CHAIN, getAppChainById } from '@/wallet/appChain'
import { ensureWalletChain, getPublicClient, getWalletClientFromPrivyWallet } from '@/wallet/viemClients'
import { useActiveWallet } from '@/wallet/useActiveWallet'

const ENTRY_POINT_HANDLE_OPS_ABI = [
  {
    type: 'function',
    name: 'handleOps',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'ops',
        type: 'tuple[]',
        components: [
          { name: 'sender', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'initCode', type: 'bytes' },
          { name: 'callData', type: 'bytes' },
          { name: 'accountGasLimits', type: 'bytes32' },
          { name: 'preVerificationGas', type: 'uint256' },
          { name: 'gasFees', type: 'bytes32' },
          { name: 'paymasterAndData', type: 'bytes' },
          { name: 'signature', type: 'bytes' },
        ],
      },
      { name: 'beneficiary', type: 'address' },
    ],
    outputs: [],
  },
] as const satisfies Abi

const EXECUTE_PAYLOAD_RETRY_ATTEMPTS = 4
const EXECUTE_PAYLOAD_RETRY_BASE_MS = 1500

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isExecuteInProgressError(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) return false
  if (error.apiCode === 'MULTISIG_EXECUTE_IN_PROGRESS') return true
  return error.status === 409 && /multisig execution is in progress/i.test(error.message)
}

function isAlreadyExecutedOnChainError(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) return false
  if (error.apiCode === 'MULTISIG_ALREADY_EXECUTED_ON_CHAIN') return true
  return (
    error.status === 409 &&
    /already succeeded on-chain|already executed on-chain|do not submit another handleOps/i.test(
      error.message,
    )
  )
}

async function fetchExecutionPayloadWithRetry(
  accessToken: string,
  proposalId: string,
  options?: { ackQueueJump?: boolean },
): Promise<Awaited<ReturnType<typeof fetchMultisigExecutionPayload>>> {
  let lastError: unknown
  for (let attempt = 0; attempt < EXECUTE_PAYLOAD_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await fetchMultisigExecutionPayload(accessToken, proposalId, options)
    } catch (error) {
      lastError = error
      if (!isExecuteInProgressError(error) || attempt >= EXECUTE_PAYLOAD_RETRY_ATTEMPTS - 1) {
        throw error
      }
      await sleep(EXECUTE_PAYLOAD_RETRY_BASE_MS * (attempt + 1))
    }
  }
  throw lastError
}

export type GovernanceExecuteErrorMeta = {
  code: AppErrorCode | null
  blockingProposalIds: string[]
  /** When set, retry should confirm this mined hash — not broadcast a new handleOps. */
  pendingConfirmTxHash: string | null
}

function formatExecuteErrorMessage(error: unknown, blockingIds: string[]): string {
  const base = toAppUserFacingError(error, {
    fallback: 'Could not execute proposal.',
    context: 'governance_execute',
  })
  if (!blockingIds.length) return base
  return `${base}\n\nRelated proposals:\n${blockingIds.join('\n')}`
}

export type UseGovernanceExecuteProposalOptions = {
  confirmQueueJumpFromApiError?: (error: unknown) => Promise<boolean>
  onQueueJumpPrepared?: () => void
}

export function useGovernanceExecuteProposal(options: UseGovernanceExecuteProposalOptions = {}) {
  const { confirmQueueJumpFromApiError, onQueueJumpPrepared } = options
  const dispatch = useAppDispatch()
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const sessionWallet = useAppSelector((s) => s.auth.wallet)
  const configSigners = useAppSelector((s) => s.adminMultisig.config?.signers ?? [])
  const { wallet, address, isConnected } = useActiveWallet()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorMeta, setErrorMeta] = useState<GovernanceExecuteErrorMeta | null>(null)
  const [lastResult, setLastResult] = useState<ExecuteProposalResult | null>(null)
  const [resignRequired, setResignRequired] = useState(false)
  /** Reactive flag: mined hash exists and retry must confirm-only. */
  const [pendingConfirmActive, setPendingConfirmActive] = useState(false)

  const syncPendingConfirmFlag = useCallback((proposalId: string) => {
    setPendingConfirmActive(Boolean(getMultisigPendingExecute(proposalId)?.txHash))
  }, [])

  const finishSuccess = useCallback(
    async (proposalId: string, result: ExecuteProposalResult) => {
      clearMultisigPendingExecute(proposalId)
      setPendingConfirmActive(false)
      setLastResult(result)
      await dispatch(refreshMultisigProposalDetail(proposalId)).unwrap()
      await dispatch(refreshMultisigConfig()).unwrap().catch(() => {})
      return result
    },
    [dispatch],
  )

  const confirmMinedHash = useCallback(
    async (proposalId: string, txHash: string): Promise<ExecuteProposalResult> => {
      if (!accessToken?.trim()) {
        throw new Error('Sign in to confirm proposal execution.')
      }
      const result = await postMultisigProposalConfirmExecute(accessToken, proposalId, txHash)
      return finishSuccess(proposalId, result)
    },
    [accessToken, finishSuccess],
  )

  const execute = useCallback(
    async (proposalId: string): Promise<ExecuteProposalResult | null> => {
      const id = proposalId.trim()
      if (!id) {
        setError('Missing proposal id.')
        return null
      }
      if (!accessToken?.trim()) {
        setError('Sign in to execute proposals.')
        return null
      }

      setPending(true)
      setError(null)
      setErrorMeta(null)
      setResignRequired(false)
      setLastResult(null)
      dispatch(clearAdminMultisigActionError())
      try {
        // Peek payload early so Soroban can execute via backend without Privy.
        const earlyPayload = await fetchExecutionPayloadWithRetry(accessToken, id)
        const isSoroban =
          earlyPayload.vm === 'soroban' ||
          isStellarChainId(earlyPayload.chainId) ||
          !earlyPayload.userOp

        const actor = resolveGovernanceActorAddress({
          connectedAddress: address,
          sessionWallet,
          allowSessionWalletFallback: isSoroban,
        })
        if (!actor) {
          throw new Error(
            isSoroban
              ? 'Sign in with the Stellar admin (owner) wallet to execute this proposal.'
              : 'Connect an on-chain multisig owner wallet to execute.',
          )
        }
        if (!isGovernanceSignerAddress(actor, configSigners)) {
          throw new Error('Connected wallet is not an on-chain multisig owner.')
        }
        if (
          !isSoroban &&
          sessionWallet?.trim() &&
          sessionWallet.toLowerCase() !== actor.toLowerCase()
        ) {
          throw new Error(
            'Connected wallet must match the wallet used for this admin login session.',
          )
        }
        if (!isSoroban && (!isConnected || !wallet || !address)) {
          throw new Error('Connect an on-chain multisig owner wallet to execute.')
        }

        // If a prior handleOps already mined for this proposal, only confirm — never re-broadcast.
        const pendingExecute = getMultisigPendingExecute(id)
        setPendingConfirmActive(Boolean(pendingExecute?.txHash))
        if (pendingExecute?.txHash) {
          try {
            return await confirmMinedHash(id, pendingExecute.txHash)
          } catch (confirmError) {
            if (isAlreadyExecutedOnChainError(confirmError)) {
              clearMultisigPendingExecute(id)
              setPendingConfirmActive(false)
              await dispatch(refreshMultisigProposalDetail(id)).unwrap().catch(() => {})
              setLastResult({
                message: 'Proposal already executed on-chain.',
                txHash: pendingExecute.txHash,
              })
              return {
                message: 'Proposal already executed on-chain.',
                txHash: pendingExecute.txHash,
              }
            }
            setErrorMeta({
              code: 'EXEC_CONFIRM_PENDING',
              blockingProposalIds: blockingProposalIdsFromApiError(confirmError),
              pendingConfirmTxHash: pendingExecute.txHash,
            })
            setPendingConfirmActive(true)
            setError(
              formatExecuteErrorMessage(
                confirmError instanceof Error
                  ? confirmError
                  : new Error(
                      'The transaction mined on-chain, but confirmation failed. Retry confirmation — do not submit a new transaction.',
                    ),
                blockingProposalIdsFromApiError(confirmError),
              ),
            )
            return null
          }
        }

        let payload: Awaited<ReturnType<typeof fetchMultisigExecutionPayload>>
        try {
          payload = await fetchExecutionPayloadWithRetry(accessToken, id)
        } catch (firstError) {
          if (isAlreadyExecutedOnChainError(firstError)) {
            clearMultisigPendingExecute(id)
            setPendingConfirmActive(false)
            await dispatch(refreshMultisigProposalDetail(id)).unwrap().catch(() => {})
            const txFromDetails =
              firstError instanceof ApiRequestError &&
              firstError.apiDetails &&
              typeof firstError.apiDetails.txHash === 'string'
                ? String(firstError.apiDetails.txHash)
                : ''
            setLastResult({
              message: 'Proposal already executed on-chain.',
              txHash: txFromDetails,
            })
            return {
              message: 'Proposal already executed on-chain.',
              txHash: txFromDetails,
            }
          }
          if (
            firstError instanceof ApiRequestError &&
            firstError.apiCode === 'EXECUTE_QUEUE_JUMP_ACK_REQUIRED' &&
            confirmQueueJumpFromApiError
          ) {
            // Hide loading overlay while the confirm modal is open (same z-index stack).
            setPending(false)
            const accepted = await confirmQueueJumpFromApiError(firstError)
            if (!accepted) return null
            setPending(true)
            try {
              payload = await fetchExecutionPayloadWithRetry(accessToken, id, { ackQueueJump: true })
            } catch (ackError) {
              if (isAlreadyExecutedOnChainError(ackError)) {
                clearMultisigPendingExecute(id)
                setPendingConfirmActive(false)
                await dispatch(refreshMultisigProposalDetail(id)).unwrap().catch(() => {})
                setLastResult({ message: 'Proposal already executed on-chain.', txHash: '' })
                return { message: 'Proposal already executed on-chain.', txHash: '' }
              }
              if (
                ackError instanceof ApiRequestError &&
                ackError.apiCode === 'MULTISIG_RESIGN_REQUIRED'
              ) {
                setResignRequired(true)
                onQueueJumpPrepared?.()
                await dispatch(refreshMultisigProposalDetail(id)).unwrap().catch(() => {})
                throw ackError
              }
              throw ackError
            }
          } else {
            throw firstError
          }
        }

        if (payload.vm === 'soroban' || isStellarChainId(payload.chainId) || !payload.userOp) {
          const result = await postMultisigProposalExecute(accessToken, id)
          return finishSuccess(id, result)
        }

        if (!wallet || !address) {
          throw new Error('Connect an on-chain multisig owner wallet to execute.')
        }
        if (payload.chainId > 0) {
          await ensureWalletChain(wallet, payload.chainId)
        }
        const walletClient = await getWalletClientFromPrivyWallet(wallet, payload.chainId)
        const chain = getAppChainById(payload.chainId) ?? DEFAULT_APP_CHAIN
        const account = address as Address
        const beneficiary = account
        const hash = await walletClient.writeContract({
          chain,
          address: payload.entryPoint,
          abi: ENTRY_POINT_HANDLE_OPS_ABI,
          functionName: 'handleOps',
          args: [
            [
              {
                sender: payload.userOp.sender,
                nonce: payload.userOp.nonce,
                initCode: payload.userOp.initCode,
                callData: payload.userOp.callData,
                accountGasLimits: payload.userOp.accountGasLimits,
                preVerificationGas: payload.userOp.preVerificationGas,
                gasFees: payload.userOp.gasFees,
                paymasterAndData: payload.userOp.paymasterAndData,
                signature: payload.userOp.signature,
              },
            ],
            beneficiary,
          ],
          account,
          gas: BigInt(payload.handleOpsGas || 3_000_000),
        })
        const publicClient = getPublicClient(payload.chainId)
        const receipt = await publicClient.waitForTransactionReceipt({ hash: hash as Hex })
        if (receipt.status !== 'success') {
          clearMultisigPendingExecute(id)
          setPendingConfirmActive(false)
          throw new Error('EntryPoint handleOps transaction reverted.')
        }

        setMultisigPendingExecute({
          proposalId: id,
          txHash: hash,
          chainId: payload.chainId,
          savedAt: Date.now(),
        })
        setPendingConfirmActive(true)

        const userOpOk = userOpSuccessFromHandleOpsReceipt(receipt)
        if (userOpOk === false) {
          // Keep pending cleared — a failed UserOp must not be re-confirmed as success.
          clearMultisigPendingExecute(id)
          setPendingConfirmActive(false)
          // Backend may still heal if an earlier success already applied the effect.
          try {
            return await confirmMinedHash(id, hash)
          } catch {
            throw new Error(
              'EntryPoint handleOps mined but the UserOperation failed (UserOperationEvent.success=false). Inner call reverted.',
            )
          }
        }

        try {
          return await confirmMinedHash(id, hash)
        } catch (confirmError) {
          if (isAlreadyExecutedOnChainError(confirmError)) {
            clearMultisigPendingExecute(id)
            setPendingConfirmActive(false)
            await dispatch(refreshMultisigProposalDetail(id)).unwrap().catch(() => {})
            setLastResult({ message: 'Proposal already executed on-chain.', txHash: hash })
            return { message: 'Proposal already executed on-chain.', txHash: hash }
          }
          // Outer tx + UserOp succeeded; do not invite a new handleOps.
          setErrorMeta({
            code: 'EXEC_CONFIRM_PENDING',
            blockingProposalIds: blockingProposalIdsFromApiError(confirmError),
            pendingConfirmTxHash: hash,
          })
          setPendingConfirmActive(true)
          setError(
            toAppUserFacingError(confirmError, {
              fallback:
                'The transaction mined on-chain, but the server could not confirm it yet. Tap Confirm transaction — do not submit a new one.',
              context: 'governance_execute',
            }),
          )
          return null
        }
      } catch (e) {
        if (isAlreadyExecutedOnChainError(e)) {
          clearMultisigPendingExecute(id)
          setPendingConfirmActive(false)
          await dispatch(refreshMultisigProposalDetail(id)).unwrap().catch(() => {})
          setLastResult({ message: 'Proposal already executed on-chain.', txHash: '' })
          return { message: 'Proposal already executed on-chain.', txHash: '' }
        }
        const blockingIds = blockingProposalIdsFromApiError(e)
        const apiCode =
          e instanceof ApiRequestError && e.apiCode?.trim()
            ? (e.apiCode.trim() as AppErrorCode)
            : null
        const pendingHash = getMultisigPendingExecute(id)?.txHash ?? null
        setPendingConfirmActive(Boolean(pendingHash))
        setErrorMeta({
          code: apiCode,
          blockingProposalIds: blockingIds,
          pendingConfirmTxHash: pendingHash,
        })
        setError(formatExecuteErrorMessage(e, blockingIds))
        return null
      } finally {
        setPending(false)
      }
    },
    [
      accessToken,
      address,
      configSigners,
      confirmMinedHash,
      confirmQueueJumpFromApiError,
      dispatch,
      isConnected,
      onQueueJumpPrepared,
      sessionWallet,
      wallet,
    ],
  )

  return {
    execute,
    pending,
    error,
    errorMeta,
    lastResult,
    resignRequired,
    clearResignRequired: () => setResignRequired(false),
    clearError: () => {
      setError(null)
      setErrorMeta(null)
    },
    clearLastResult: () => setLastResult(null),
    /** True when a mined hash is waiting for confirm-only retry. */
    hasPendingConfirm: (proposalId: string) =>
      pendingConfirmActive || Boolean(getMultisigPendingExecute(proposalId)?.txHash),
    pendingConfirmActive,
    syncPendingConfirmFlag,
  }
}
