import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, Link, useNavigate, useParams } from 'react-router-dom'

import {
  governanceOperationLabel,
  governanceStatusPillVariant,
  isTerminalGovernanceProposalStatus,
} from '@/components/admin/governance/adminGovernanceUi'
import {
  PrivilegedActionFeedbackLayer,
  type PrivilegedActionPhase,
} from '@/admin/governance/PrivilegedActionFeedbackLayer'
import {
  canUserExecuteGovernanceProposal,
  canUserSignGovernanceProposal,
  hasGovernanceSignature,
  resolveGovernanceActorAddress,
  sessionWalletMatchesConnected,
} from '@/admin/governance/governanceSigner'
import { isStellarChainId } from '@/stellar/chain'
import {
  formatSignerMgmtCallContent,
  formatSignerMgmtDecodedArgs,
  isSignerMgmtOperationType,
} from '@/admin/governance/formatSignerMgmtDecodedArgs'
import { useGovernanceExecuteProposal } from '@/admin/governance/useGovernanceExecuteProposal'
import GovernanceNonceWarningModal from '@/admin/governance/GovernanceNonceWarningModal'
import { useAdminConfirmDialog } from '@/admin/governance/useAdminConfirmDialog'
import { useGovernanceConfirmModal } from '@/admin/governance/useGovernanceConfirmModal'
import { useGovernanceRestartSignatures } from '@/admin/governance/useGovernanceRestartSignatures'
import { useGovernanceSignAndSubmit } from '@/admin/governance/useGovernanceSignAndSubmit'
import { adminGovernanceProposalPath } from '@/api/adminActionResponse'
import type { NonceStatus, ProposalNonceInfo } from '@/api/types/multisig'
import { proposalStatusLabel } from '@/api/multisig/normalize'
import { normalizeMultisigSignerMgmtSync } from '@/api/multisig/normalize'
import { getDefaultBlockExplorerBase, blockExplorerTxUrl } from '@/api/payout'
import AdminConfirmModal from '@/components/admin/AdminConfirmModal'
import { AdminPageFrame, AdminPanel, AdminStatusPill } from '@/components/admin/primitives'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  cancelMultisigProposal,
  clearAdminMultisigActionError,
  refreshMultisigConfig,
  refreshMultisigProposalDetail,
  selectMultisigProposalDetail,
} from '@/store/slices/adminMultisigSlice'
import { useActiveWallet } from '@/wallet/useActiveWallet'

const GOVERNANCE_LIST_PATH = '/dashboard/admin/governance'
const DETAIL_POLL_MS = 30_000
const DETAIL_POLL_MS_ACTIVE = 20_000

function nonceBannerClass(status: NonceStatus): string {
  switch (status) {
    case 'stale':
      return 'border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]'
    case 'queued':
      return 'border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]'
    case 'current':
      return 'border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]'
    default:
      return 'border-[#E6E8EC] bg-[#F8FAFC] text-[#475569]'
  }
}

function NonceStatusBanner({
  nonce,
  isSoroban = false,
}: {
  nonce: ProposalNonceInfo
  isSoroban?: boolean
}) {
  if (isSoroban) {
    return (
      <div className={`rounded-[8px] border px-4 py-3 text-[13px] ${nonceBannerClass('current')}`}>
        <p className="font-semibold">Stellar FistMultisig (1-of-1)</p>
        <p className="mt-1">
          Sign with the admin owner wallet to confirm, then execute. No ERC-4337 UserOp or reserved
          nonce — the backend relays FistMultisig.confirm + execute.
        </p>
      </div>
    )
  }

  const title =
    nonce.nonceStatus === 'stale'
      ? 'Nonce bypassed — restart signatures'
      : nonce.nonceStatus === 'queued'
        ? `Queued (nonce ${nonce.reservedNonce ?? '—'})`
        : nonce.nonceStatus === 'current'
          ? `Ready to execute (nonce ${nonce.reservedNonce ?? '—'})`
          : `Reserved nonce ${nonce.reservedNonce ?? '—'}`

  const detail =
    nonce.nonceStatus === 'stale'
      ? `Reserved nonce ${nonce.reservedNonce ?? '—'} is behind live nonce ${nonce.liveNonce}. Signatures are invalid until you restart.`
      : nonce.nonceStatus === 'queued'
        ? `Live on-chain nonce is ${nonce.liveNonce}. Execute earlier proposals in the queue first.`
        : nonce.nonceStatus === 'unfrozen'
          ? 'Sign to freeze the UserOp at this reserved nonce.'
          : null

  return (
    <div className={`rounded-[8px] border px-4 py-3 text-[13px] ${nonceBannerClass(nonce.nonceStatus)}`}>
      <p className="font-semibold">{title}</p>
      {detail ? <p className="mt-1">{detail}</p> : null}
      {nonce.blockingProposalIds.length > 0 ? (
        <ul className="mt-2 space-y-1 font-mono text-[12px]">
          {nonce.blockingProposalIds.map((id) => (
            <li key={id}>
              <Link to={adminGovernanceProposalPath(id)} className="underline hover:no-underline">
                {id}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function formatDecodedArgs(args?: Record<string, unknown>): string | null {
  if (!args || !Object.keys(args).length) return null
  try {
    return JSON.stringify(args, null, 2)
  } catch {
    return null
  }
}

function BackendKeyAlignmentWarning({ postExecuteSync }: { postExecuteSync: unknown }) {
  const signerMgmt = normalizeMultisigSignerMgmtSync(postExecuteSync)
  if (!signerMgmt || signerMgmt.backendKeyAlignment.allAligned) return null
  const misaligned = signerMgmt.backendKeyAlignment.misalignedBackendKeys
  if (!misaligned.length) return null

  return (
    <div className="rounded-[10px] border border-[#FDE68A] bg-[#FFFBEB] px-5 py-4">
      <p className="text-[#92400E] text-[14px] font-semibold">Backend key alignment warning</p>
      <p className="text-[#78350F] text-[13px] mt-1">
        On-chain owners changed but backend environment keys no longer match. Update server{' '}
        <span className="font-mono">ADMIN</span> / <span className="font-mono">SERVICER</span> configuration before
        further governance actions.
      </p>
      <ul className="mt-2 space-y-1 font-mono text-[12px] text-[#92400E]">
        {misaligned.map((key) => (
          <li key={key}>{key}</li>
        ))}
      </ul>
    </div>
  )
}

const AdminGovernanceProposalDetailPage = () => {
  const { proposalId } = useParams<{ proposalId: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const sessionKind = useAppSelector((s) => s.auth.sessionKind)
  const sessionWallet = useAppSelector((s) => s.auth.wallet)
  const { config, detailStatus, actionStatus, actionKind, actionError } = useAppSelector(
    (s) => s.adminMultisig,
  )
  const detail = useAppSelector((s) =>
    proposalId ? selectMultisigProposalDetail(s.adminMultisig, proposalId) : null,
  )
  const { address } = useActiveWallet()
  const {
    confirmNonceWarning,
    confirmQueueJumpFromApiError,
    modalProps: nonceWarningModalProps,
    isModalOpen: nonceModalOpen,
  } = useGovernanceConfirmModal()
  const {
    confirm: confirmAction,
    modalProps: actionConfirmModalProps,
    isOpen: actionConfirmOpen,
  } = useAdminConfirmDialog()
  const anyConfirmOpen = nonceModalOpen || actionConfirmOpen
  const { signAndSubmit, pending: signPending, error: signHookError, clearError: clearSignError } =
    useGovernanceSignAndSubmit({ confirmNonceWarning })
  const {
    execute: executeOnChain,
    pending: executePending,
    error: executeHookError,
    errorMeta: executeErrorMeta,
    lastResult: executeHookResult,
    resignRequired,
    clearResignRequired,
    clearError: clearExecuteError,
    clearLastResult: clearExecuteResult,
    hasPendingConfirm,
    pendingConfirmActive,
    syncPendingConfirmFlag,
  } = useGovernanceExecuteProposal({
    confirmQueueJumpFromApiError,
    onQueueJumpPrepared: () => {
      if (proposalId) void dispatch(refreshMultisigProposalDetail(proposalId))
    },
  })
  const pendingConfirmExecute = Boolean(
    pendingConfirmActive ||
      (proposalId && hasPendingConfirm(proposalId)) ||
      executeErrorMeta?.pendingConfirmTxHash ||
      executeErrorMeta?.code === 'EXEC_CONFIRM_PENDING',
  )
  const {
    restart: restartSignatures,
    pending: restartPending,
    error: restartHookError,
    clearError: clearRestartError,
  } = useGovernanceRestartSignatures()
  const [signingNote, setSigningNote] = useState<string | null>(null)

  useEffect(() => {
    if (!proposalId?.trim() || !accessToken?.trim() || sessionKind !== 'admin') return
    void dispatch(refreshMultisigConfig())
    void dispatch(refreshMultisigProposalDetail(proposalId))
    syncPendingConfirmFlag(proposalId)
  }, [dispatch, proposalId, accessToken, sessionKind, syncPendingConfirmFlag])

  const shouldPollDetail = useMemo(() => {
    if (!detail) return false
    return detail.status === 'pending_signatures' || detail.status === 'ready'
  }, [detail])

  const detailPollMs = useMemo(() => {
    const status = detail?.nonce?.nonceStatus
    if (status === 'queued' || status === 'stale') return DETAIL_POLL_MS_ACTIVE
    return DETAIL_POLL_MS
  }, [detail?.nonce?.nonceStatus])

  useEffect(() => {
    if (!proposalId?.trim() || !accessToken?.trim() || sessionKind !== 'admin' || !shouldPollDetail) {
      return
    }
    const id = window.setInterval(() => {
      void dispatch(refreshMultisigProposalDetail(proposalId))
    }, detailPollMs)
    return () => window.clearInterval(id)
  }, [dispatch, proposalId, accessToken, sessionKind, shouldPollDetail, detailPollMs])

  const isSorobanProposal = useMemo(() => {
    if (config?.vm === 'soroban') return true
    if (isStellarChainId(config?.chainId)) return true
    const first = detail?.calls?.[0] as { stellar?: { vm?: string } } | undefined
    return first?.stellar?.vm === 'soroban'
  }, [config?.vm, config?.chainId, detail?.calls])

  const actorAddress = useMemo(
    () =>
      resolveGovernanceActorAddress({
        connectedAddress: address,
        sessionWallet,
        allowSessionWalletFallback: isSorobanProposal,
      }),
    [address, sessionWallet, isSorobanProposal],
  )

  const isSigner = useMemo(
    () =>
      Boolean(
        actorAddress &&
          (config?.signers ?? []).some((s) => s.toLowerCase() === actorAddress.toLowerCase()),
      ),
    [actorAddress, config?.signers],
  )

  const handleSign = useCallback(async () => {
    if (!proposalId) return
    const result = await signAndSubmit(proposalId)
    if (!result) return
    if (result.signingNote) setSigningNote(result.signingNote)
    await dispatch(refreshMultisigProposalDetail(proposalId)).unwrap()
  }, [proposalId, signAndSubmit, dispatch])

  const handleExecute = useCallback(() => {
    if (!proposalId) return
    void executeOnChain(proposalId)
  }, [executeOnChain, proposalId])

  const handleRestartSignatures = useCallback(async () => {
    if (!proposalId) return
    const ok = await confirmAction({
      title: 'Restart signatures?',
      description:
        'Clear all signatures and assign a new reserved nonce. Every owner must sign again.',
      confirmLabel: 'Restart signatures',
      cancelLabel: 'Go back',
      variant: 'warning',
    })
    if (!ok) return
    void restartSignatures(proposalId)
  }, [proposalId, restartSignatures, confirmAction])

  const handleCancel = useCallback(async () => {
    if (!proposalId) return
    const ok = await confirmAction({
      title: 'Cancel this proposal?',
      description:
        'This cancels the governance proposal and clears collected signatures. This cannot be undone.',
      confirmLabel: 'Cancel proposal',
      cancelLabel: 'Go back',
      variant: 'destructive',
    })
    if (!ok) return
    void dispatch(cancelMultisigProposal(proposalId))
  }, [dispatch, proposalId, confirmAction])

  const handleDismissActionFeedback = useCallback(() => {
    clearSignError()
    clearExecuteError()
    clearRestartError()
    dispatch(clearAdminMultisigActionError())
  }, [clearSignError, clearExecuteError, clearRestartError, dispatch])

  const handleDismissExecuteSuccess = useCallback(() => {
    clearExecuteResult()
  }, [clearExecuteResult])

  const handleRetryGovernanceAction = useCallback(() => {
    if (!proposalId) return
    if (restartHookError) {
      void handleRestartSignatures()
      return
    }
    if (signHookError) {
      void handleSign()
      return
    }
    if (executeHookError) {
      const blocking =
        executeErrorMeta?.blockingProposalIds.length
          ? executeErrorMeta.blockingProposalIds
          : (detail?.nonce?.blockingProposalIds ?? [])
      if (
        (executeErrorMeta?.code === 'MULTISIG_EXECUTE_QUEUED' ||
          executeErrorMeta?.code === 'EXECUTE_QUEUE_JUMP_ACK_REQUIRED' ||
          detail?.nonce?.nonceStatus === 'queued') &&
        blocking[0]
      ) {
        navigate(adminGovernanceProposalPath(blocking[0]))
        clearExecuteError()
        return
      }
      if (/stale|MULTISIG_STALE_NONCE|restart signatures/i.test(executeHookError)) {
        void handleRestartSignatures()
        return
      }
      void executeOnChain(proposalId)
      return
    }
    if (actionKind === 'cancel') {
      void handleCancel()
    }
  }, [
    proposalId,
    signHookError,
    executeHookError,
    executeErrorMeta,
    detail?.nonce?.blockingProposalIds,
    detail?.nonce?.nonceStatus,
    restartHookError,
    actionKind,
    handleSign,
    executeOnChain,
    handleRestartSignatures,
    handleCancel,
    clearExecuteError,
    navigate,
  ])

  const governanceErrorPrimaryLabel = useMemo(() => {
    if (executeHookError) {
      const blocking =
        executeErrorMeta?.blockingProposalIds.length
          ? executeErrorMeta.blockingProposalIds
          : (detail?.nonce?.blockingProposalIds ?? [])
      if (executeErrorMeta?.code === 'MULTISIG_EXECUTE_QUEUED' && blocking.length) {
        return 'Open blocking proposal'
      }
      if (pendingConfirmExecute) {
        return 'Confirm transaction'
      }
      if (/stale|MULTISIG_STALE_NONCE|restart signatures/i.test(executeHookError)) {
        return 'Restart signatures'
      }
    }
    return undefined
  }, [
    executeHookError,
    executeErrorMeta,
    detail?.nonce?.blockingProposalIds,
    pendingConfirmExecute,
  ])

  const governanceFeedback = useMemo(() => {
    // Never show restart loading under a confirm dialog.
    if (restartPending && !anyConfirmOpen) {
      return {
        phase: 'loading' as PrivilegedActionPhase,
        errorDescription: undefined as string | undefined,
        loadingTitle: 'Restarting signatures',
        loadingDescription: 'Clearing signatures and assigning a new reserved nonce…',
        errorTitle: 'Unable to restart signatures',
        directSuccessTitle: 'Signatures restarted',
      }
    }
    if (restartHookError) {
      return {
        phase: 'failed' as PrivilegedActionPhase,
        errorDescription: restartHookError,
        loadingTitle: 'Restarting signatures',
        loadingDescription: '',
        errorTitle: 'Unable to restart signatures',
        directSuccessTitle: 'Signatures restarted',
      }
    }
    // Never stack the loading overlay over a confirm modal.
    if (signPending && !anyConfirmOpen) {
      return {
        phase: 'loading' as PrivilegedActionPhase,
        errorDescription: undefined as string | undefined,
        loadingTitle: 'Signing proposal',
        loadingDescription: 'Requesting signature payload and submitting your signature…',
        errorTitle: 'Unable to sign proposal',
        directSuccessTitle: 'Proposal signed',
      }
    }
    if (signHookError) {
      return {
        phase: 'failed' as PrivilegedActionPhase,
        errorDescription: signHookError,
        loadingTitle: 'Signing proposal',
        loadingDescription: '',
        errorTitle: 'Unable to sign proposal',
        directSuccessTitle: 'Proposal signed',
      }
    }
    if (executePending && !anyConfirmOpen) {
      return {
        phase: 'loading' as PrivilegedActionPhase,
        errorDescription: undefined as string | undefined,
        loadingTitle: pendingConfirmExecute
          ? 'Confirming transaction'
          : 'Executing proposal',
        loadingDescription: pendingConfirmExecute
          ? 'Confirming the mined transaction with the server — not submitting a new one…'
          : isSorobanProposal
            ? 'Relaying FistMultisig.confirm + execute via the backend…'
            : 'Submitting EntryPoint.handleOps from your connected wallet…',
        errorTitle: 'Unable to execute proposal',
        directSuccessTitle: 'Proposal executed',
      }
    }
    if (executeHookError) {
      return {
        phase: 'failed' as PrivilegedActionPhase,
        errorDescription: executeHookError,
        loadingTitle: 'Executing proposal',
        loadingDescription: '',
        errorTitle: pendingConfirmExecute
          ? 'Confirm mined transaction'
          : 'Unable to execute proposal',
        directSuccessTitle: 'Proposal executed',
      }
    }
    if (actionKind === 'cancel') {
      let phase: PrivilegedActionPhase = 'idle'
      if ((actionStatus === 'loading' && !anyConfirmOpen) || actionStatus === 'failed') {
        phase = actionStatus === 'loading' ? 'loading' : 'failed'
      } else if (actionStatus === 'succeeded') {
        phase = 'succeeded'
      }
      return {
        phase,
        errorDescription: actionError ?? undefined,
        loadingTitle: 'Cancelling proposal',
        loadingDescription: 'Cancelling this governance proposal…',
        errorTitle: 'Unable to cancel proposal',
        directSuccessTitle: 'Proposal cancelled',
      }
    }
    return {
      phase: 'idle' as const,
      errorDescription: undefined,
      loadingTitle: '',
      loadingDescription: '',
      errorTitle: '',
      directSuccessTitle: '',
    }
  }, [
    restartPending,
    restartHookError,
    signPending,
    signHookError,
    executePending,
    executeHookError,
    executeErrorMeta,
    pendingConfirmExecute,
    anyConfirmOpen,
    actionKind,
    actionStatus,
    actionError,
    isSorobanProposal,
  ])

  if (!proposalId) {
    return <Navigate to={GOVERNANCE_LIST_PATH} replace />
  }

  const loading = detailStatus === 'loading' && !detail
  const explorerBase = getDefaultBlockExplorerBase()
  const txUrl =
    explorerBase && detail?.executionTxHash
      ? blockExplorerTxUrl(explorerBase, detail.executionTxHash)
      : null
  const executeTxHash = executeHookResult?.txHash
  const executeTxUrl =
    explorerBase && executeTxHash ? blockExplorerTxUrl(explorerBase, executeTxHash) : null

  const sessionMatchesWallet = isSorobanProposal
    ? Boolean(actorAddress)
    : sessionWalletMatchesConnected(sessionWallet, address)

  const alreadySigned = useMemo(() => {
    if (!actorAddress || !detail?.signatures?.length) return false
    return hasGovernanceSignature(
      actorAddress,
      detail.signatures.map((s) => s.signerAddress),
    )
  }, [actorAddress, detail?.signatures])

  const nonceInfo = detail?.nonce
  const isTerminal = detail ? isTerminalGovernanceProposalStatus(detail.status) : false
  const isNonceStale = !isSorobanProposal && !isTerminal && nonceInfo?.nonceStatus === 'stale'
  const showNonceBanner =
    (isSorobanProposal && !isTerminal) || (Boolean(nonceInfo) && !isTerminal)

  const actorConnected = Boolean(actorAddress)

  const canSign = useMemo(
    () =>
      Boolean(detail) &&
      !isNonceStale &&
      canUserSignGovernanceProposal({
        status: detail!.status,
        missingSigners: detail!.missingSigners,
        walletAddress: actorAddress,
        multisigSigners: config?.signers ?? [],
        signedAddresses: detail!.signatures.map((s) => s.signerAddress),
        isConnected: actorConnected,
      }) &&
      sessionMatchesWallet &&
      !signPending &&
      !executePending &&
      !anyConfirmOpen &&
      actionStatus !== 'loading',
    [
      detail,
      isNonceStale,
      actorAddress,
      actorConnected,
      config?.signers,
      sessionMatchesWallet,
      signPending,
      executePending,
      anyConfirmOpen,
      actionStatus,
    ],
  )

  const canExecute = useMemo(
    () =>
      Boolean(detail) &&
      !isNonceStale &&
      (isSorobanProposal
        ? Boolean(detail!.readyToExecute)
        : (nonceInfo?.canExecute ?? Boolean(detail!.readyToExecute))) &&
      canUserExecuteGovernanceProposal({
        readyToExecute: Boolean(detail!.readyToExecute),
        status: detail!.status,
        walletAddress: actorAddress,
        multisigSigners: config?.signers ?? [],
        sessionWallet: isSorobanProposal ? undefined : sessionWallet,
        isConnected: actorConnected,
      }) &&
      !signPending &&
      !executePending &&
      !anyConfirmOpen &&
      actionStatus !== 'loading',
    [
      detail,
      isNonceStale,
      isSorobanProposal,
      nonceInfo,
      actorAddress,
      actorConnected,
      config?.signers,
      sessionWallet,
      signPending,
      executePending,
      anyConfirmOpen,
      actionStatus,
    ],
  )

  const canRestart =
    Boolean(detail?.nonce?.canRestartSignatures) &&
    !isTerminal &&
    !signPending &&
    !executePending &&
    !restartPending &&
    !anyConfirmOpen &&
    actionStatus !== 'loading'

  const canCancel =
    Boolean(detail) &&
    detail!.status !== 'executed' &&
    detail!.status !== 'cancelled' &&
    !signPending &&
    !executePending &&
    !anyConfirmOpen &&
    actionStatus !== 'loading'

  const signatureProgress =
    detail && detail.threshold > 0
      ? Math.min(100, Math.round((detail.validSignatureCount / detail.threshold) * 100))
      : 0

  return (
    <AdminPageFrame>
      <GovernanceNonceWarningModal {...nonceWarningModalProps} />
      <AdminConfirmModal {...actionConfirmModalProps} />
      <PrivilegedActionFeedbackLayer
        phase={governanceFeedback.phase}
        resolvedOutcome={null}
        loadingTitle={governanceFeedback.loadingTitle}
        loadingDescription={governanceFeedback.loadingDescription}
        errorTitle={governanceFeedback.errorTitle}
        errorDescription={governanceFeedback.errorDescription}
        directSuccessTitle={governanceFeedback.directSuccessTitle}
        onDismiss={handleDismissActionFeedback}
        onRetry={handleRetryGovernanceAction}
        errorPrimaryLabel={governanceErrorPrimaryLabel}
        suppressLoading={anyConfirmOpen}
      />

      <button
        type="button"
        onClick={() => navigate(GOVERNANCE_LIST_PATH)}
        className="text-[#195EBC] text-[14px] font-medium hover:underline w-fit"
      >
        ← Back to governance queue
      </button>

      {loading ? (
        <p className="text-[#6B7488] text-[14px]">Loading proposal…</p>
      ) : !detail ? (
        <p className="text-[#6B7488] text-[14px]">Proposal not found.</p>
      ) : (
        <div className="flex flex-col gap-6">
          <AdminPanel>
            <div className="px-5 py-5 flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[#6B7488] text-[13px]">{governanceOperationLabel(detail.operationType)}</p>
                  <h2 className="text-[#0B1220] text-[20px] font-bold mt-1">{detail.summary}</h2>
                  <p className="text-[#6B7488] text-[13px] mt-2 font-mono">{detail.id}</p>
                </div>
                <AdminStatusPill variant={governanceStatusPillVariant(detail.status)}>
                  {proposalStatusLabel(detail.status)}
                </AdminStatusPill>
              </div>

              {showNonceBanner && (isSorobanProposal || nonceInfo) ? (
                <NonceStatusBanner
                  nonce={
                    nonceInfo ?? {
                      reservedNonce: null,
                      frozenNonce: null,
                      liveNonce: 0,
                      nonceStatus: 'current',
                      queueSeq: null,
                      canExecute: true,
                      canRestartSignatures: false,
                      blockingProposalIds: [],
                      restartCount: 0,
                    }
                  }
                  isSoroban={isSorobanProposal}
                />
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-[14px]">
                <div>
                  <p className="text-[#6B7488] text-[12px]">Signatures</p>
                  <p className="text-[#0B1220] font-semibold mt-1">
                    {detail.validSignatureCount} / {detail.threshold}
                  </p>
                  <div className="mt-2 h-2 w-full max-w-[200px] rounded-full bg-[#E6E8EC] overflow-hidden">
                    <div
                      className="h-full bg-[#195EBC] transition-all duration-300"
                      style={{ width: `${signatureProgress}%` }}
                    />
                  </div>
                </div>
                <div>
                  <p className="text-[#6B7488] text-[12px]">Related</p>
                  <p className="text-[#0B1220] font-mono text-[13px] mt-1 break-all">
                    {detail.relatedType ?? '—'} · {detail.relatedId ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[#6B7488] text-[12px]">Created</p>
                  <p className="text-[#0B1220] mt-1">
                    {detail.createdAt ? new Date(detail.createdAt).toLocaleString() : '—'}
                  </p>
                </div>
              </div>

              {detail.preconditions.some((p) => !p.ok) ? (
                <div className="rounded-[8px] border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3">
                  <p className="text-[#92400E] text-[14px] font-semibold">Failed preconditions</p>
                  <ul className="mt-2 space-y-1 text-[#78350F] text-[13px]">
                    {detail.preconditions
                      .filter((p) => !p.ok)
                      .map((p, i) => (
                        <li key={i}>
                          {p.label ?? 'Check'}: {p.error ?? 'Failed'}
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}

              {detail.signatures.length > 0 ? (
                <div>
                  <p className="text-[#6B7488] text-[13px] font-medium">Signed</p>
                  <ul className="mt-2 space-y-1 font-mono text-[13px] text-[#16A34A]">
                    {detail.signatures.map((s) => (
                      <li key={s.signerAddress}>✓ {s.signerAddress}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {detail.missingSigners.length > 0 ? (
                <div>
                  <p className="text-[#6B7488] text-[13px] font-medium">Missing signers</p>
                  <ul className="mt-2 space-y-1 font-mono text-[13px] text-[#0B1220]">
                    {detail.missingSigners.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {txUrl ? (
                <p className="text-[14px]">
                  Execution tx:{' '}
                  <a href={txUrl} target="_blank" rel="noopener noreferrer" className="text-[#195EBC] hover:underline">
                    {detail.executionTxHash}
                  </a>
                </p>
              ) : null}

              {detail.status === 'failed' ? (
                <p className="text-[#B91C1C] text-[14px]">
                  Execution failed. Contact ops — there is no automatic retry for this proposal.
                </p>
              ) : null}
            </div>
          </AdminPanel>

          {executeTxHash ? (
            <div className="rounded-[10px] border border-[#BBF7D0] bg-[#F0FDF4] px-5 py-4">
              <p className="text-[#166534] text-[14px] font-semibold">Execution submitted</p>
              <p className="text-[#15803D] text-[13px] mt-1">{executeHookResult?.message || ''}</p>
              {executeTxUrl ? (
                <a
                  href={executeTxUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#195EBC] text-[13px] font-semibold hover:underline mt-2 inline-block"
                >
                  View transaction
                </a>
              ) : null}
              <button
                type="button"
                onClick={handleDismissExecuteSuccess}
                className="mt-2 block text-[#6B7488] text-[12px] hover:underline"
              >
                Dismiss
              </button>
            </div>
          ) : null}

          {executeHookResult?.postExecuteSync ? (
            <BackendKeyAlignmentWarning postExecuteSync={executeHookResult.postExecuteSync} />
          ) : null}

          {resignRequired ? (
            <div className="rounded-[10px] border border-[#FDE68A] bg-[#FFFBEB] px-5 py-4 text-[13px] text-[#92400E]">
              <p className="font-semibold">Queue jump prepared — re-sign required</p>
              <p className="mt-1">
                Existing signatures were cleared and this proposal now uses the live on-chain nonce.
                All owners must sign again before you can execute on-chain.
              </p>
              <button
                type="button"
                onClick={() => clearResignRequired()}
                className="mt-2 text-[12px] font-semibold text-[#B45309] hover:underline"
              >
                Dismiss
              </button>
            </div>
          ) : null}

          <AdminPanel>
            <div className="px-5 py-5 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={!canSign}
                onClick={() => void handleSign()}
                className="h-10 px-5 rounded-[4px] bg-[#195EBC] text-white text-[14px] font-semibold disabled:opacity-40"
              >
                {signPending || (actionStatus === 'loading' && actionKind === 'sign')
                  ? 'Signing…'
                  : 'Sign proposal'}
              </button>
              <button
                type="button"
                disabled={!canExecute}
                onClick={handleExecute}
                className="h-10 px-5 rounded-[4px] bg-[#16A34A] text-white text-[14px] font-semibold disabled:opacity-40"
              >
                {executePending
                  ? pendingConfirmExecute
                    ? 'Confirming…'
                    : 'Executing…'
                  : pendingConfirmExecute
                    ? 'Confirm transaction'
                    : 'Execute'}
              </button>
              <button
                type="button"
                disabled={!canRestart}
                onClick={handleRestartSignatures}
                className="h-10 px-5 rounded-[4px] bg-[#D97706] text-white text-[14px] font-semibold disabled:opacity-40"
              >
                {restartPending ? 'Restarting…' : 'Restart signatures'}
              </button>
              <button
                type="button"
                disabled={!canCancel}
                onClick={handleCancel}
                className="h-10 px-5 rounded-[4px] bg-[#DC2626] text-white text-[14px] font-semibold disabled:opacity-40"
              >
                {actionStatus === 'loading' && actionKind === 'cancel' ? 'Cancelling…' : 'Cancel'}
              </button>
            </div>
            {signingNote ? (
              <p className="px-5 pb-2 text-[#6B7488] text-[13px]">{signingNote}</p>
            ) : null}
            {!actorConnected ? (
              <p className="px-5 pb-4 text-[#6B7488] text-[13px]">
                {isSorobanProposal
                  ? 'Sign in as the Stellar admin owner (Freighter) to sign this proposal.'
                  : 'Connect your owner wallet in the top bar to sign this proposal.'}
              </p>
            ) : !sessionMatchesWallet ? (
              <p className="px-5 pb-4 text-[#92400E] text-[13px]">
                Reconnect the wallet used for admin login to sign or execute.
              </p>
            ) : !isSigner ? (
              <p className="px-5 pb-4 text-[#6B7488] text-[13px]">
                {isSorobanProposal
                  ? 'Logged-in Stellar wallet is not a FistMultisig owner for this deployment.'
                  : 'Connected wallet is not a multisig signer for this deployment.'}
              </p>
            ) : isNonceStale ? (
              <p className="px-5 pb-4 text-[#92400E] text-[13px]">
                Nonce was bypassed. Use Restart signatures before signing again.
              </p>
            ) : alreadySigned ? (
              <p className="px-5 pb-4 text-[#16A34A] text-[13px]">You have already signed this proposal.</p>
            ) : null}
          </AdminPanel>

          {detail.calls.length > 0 ? (
            <AdminPanel>
              <div className="px-5 py-5">
                <h3 className="text-[#0B1220] font-semibold text-[16px]">On-chain calls</h3>
                <div className="mt-4 space-y-4">
                  {detail.calls.map((call, i) => {
                    const signerMgmtFormatted = detail
                      ? formatSignerMgmtCallContent(call, {
                          explorerBase,
                          signerCount: config?.signerCount ?? config?.signers.length,
                        })
                      : null
                    const decoded = formatDecodedArgs(call.decodedArgs)
                    const envelopeFormatted =
                      detail && isSignerMgmtOperationType(detail.operationType)
                        ? formatSignerMgmtDecodedArgs(detail.operationType, call.decodedArgs, {
                            explorerBase,
                            signerCount: config?.signerCount ?? config?.signers.length,
                          })
                        : null
                    const formatted = signerMgmtFormatted ?? envelopeFormatted
                    return (
                      <div key={i} className="rounded-[8px] border border-[#E6E8EC] p-4 text-[13px]">
                        {call.contract || call.function ? (
                          <p className="text-[#0B1220] font-medium">
                            {call.contract ?? 'Contract'}.{call.function ?? 'call'}
                          </p>
                        ) : null}
                        <p className="font-mono text-[#0B1220] break-all mt-1">Target: {call.target}</p>
                        {formatted ? (
                          <div className="mt-2">{formatted}</div>
                        ) : decoded ? (
                          <pre className="mt-2 text-[#6B7488] text-[12px] whitespace-pre-wrap">{decoded}</pre>
                        ) : (
                          <p className="font-mono text-[#6B7488] break-all mt-2">Calldata: {call.calldata}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </AdminPanel>
          ) : null}
        </div>
      )}
    </AdminPageFrame>
  )
}

export default AdminGovernanceProposalDetailPage
