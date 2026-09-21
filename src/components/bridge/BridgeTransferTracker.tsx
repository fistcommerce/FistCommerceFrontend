import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

import { patchBridgeTransfer, postBridgeTransferIris, type BridgeTransfer } from '@/api/bridge'
import { DashboardRequestFeedbackLayer } from '@/components/dashboard/shared/DashboardRequestFeedbackLayer'
import { explorerTxUrlForChain, sourceChainLabel } from '@/bridge/explorer'
import {
  bridgeContinueLabel,
  bridgeSignLabel,
  bridgeStatusDescription,
  bridgeStatusLabel,
  bridgeWaitingHint,
  buildBridgeSteps,
  bridgeStepProgress,
  defaultInvestPoolSlug,
  formatBridgeStartedLine,
  hasBurnTx,
  isAwaitingMintStatus,
  isReadyToContinueStatus,
  trackerListPathForPurpose,
  parseBridgeAmountHuman,
  transferNeedsSignature,
} from '@/bridge/transferStatus'
import { irisCheckSummary } from '@/bridge/irisCheck'
import { resumeUnsignedBridgeTransfer } from '@/bridge/ensureArcUsdc'
import { withBridgeSessionBusy } from '@/bridge/withBridgeSessionBusy'
import { restoreWalletChainIfSafe, resolveOriginatingChainId } from '@/bridge/restoreWalletChain'
import { useMerchantRepayLoanContext } from '@/hooks/useMerchantRepayLoanContext'
import { useReconnectSessionWallet } from '@/hooks/useReconnectSessionWallet'
import { useTestnetContracts } from '@/hooks/useTestnetContracts'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { refreshMerchantReceivables } from '@/store/slices/merchantReceivablesSlice'
import { toAppUserFacingError } from '@/errors/toAppUserFacingError'
import { waitForLiveWallet } from '@/wallet/liveWalletForWrite'
import { useActiveWallet } from '@/wallet/useActiveWallet'
import { merchantRepayPaths } from '@/components/dashboard/merchant/repay/repayFlowConfig'

type BridgeTransferTrackerProps = {
  transfer: BridgeTransfer
  role: 'investor' | 'merchant'
}

function StepRow({
  state,
  index,
  title,
  detail,
}: {
  state: 'done' | 'now' | 'left' | 'failed'
  index: number
  title: string
  detail: string
}) {
  const mark =
    state === 'done' ? 'Done' : state === 'now' ? 'Now' : state === 'failed' ? 'Failed' : 'Left'
  const markClass =
    state === 'done'
      ? 'text-[#16A34A]'
      : state === 'now'
        ? 'text-[#195EBC]'
        : state === 'failed'
          ? 'text-[#DC2626]'
          : 'text-[#9CA3AF]'
  const dotClass =
    state === 'done'
      ? 'bg-[#16A34A] text-white'
      : state === 'now'
        ? 'bg-[#195EBC] text-white'
        : state === 'failed'
          ? 'bg-[#DC2626] text-white'
          : 'bg-[#E5E7EB] text-[#6B7488]'
  return (
    <li className="flex items-start gap-3">
      <span
        className={`h-6 w-6 rounded-full shrink-0 flex items-center justify-center text-[12px] font-semibold ${dotClass}`}
        aria-hidden
      >
        {state === 'done' ? '✓' : index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className={`text-[14px] ${state === 'now' || state === 'failed' ? 'text-[#0B1220] font-medium' : 'text-[#6B7488]'}`}>
            {title}
          </p>
          <span className={`text-[11px] font-medium uppercase tracking-wide shrink-0 ${markClass}`}>{mark}</span>
        </div>
        <p className="text-[13px] text-[#6B7488] mt-0.5">{detail}</p>
      </div>
    </li>
  )
}

export default function BridgeTransferTracker({ transfer, role }: BridgeTransferTrackerProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const dispatch = useAppDispatch()
  const contracts = useTestnetContracts()
  const { wallet, address, ready } = useActiveWallet()
  const { reconnect, pending: reconnectPending } = useReconnectSessionWallet()
  const accessToken = useAppSelector((s) => s.auth?.accessToken ?? null)
  const authChainId = useAppSelector((s) => s.auth?.chainId ?? null)
  const walletChainId = useAppSelector((s) => s.wallet?.chainId)
  const repayContext = useMerchantRepayLoanContext(
    transfer.purpose === 'repayment' ? transfer.loan_request_id ?? undefined : undefined,
  )

  const [busy, setBusy] = useState(false)
  const [busyKind, setBusyKind] = useState<'sign' | 'continue'>('continue')
  const [error, setError] = useState<string | null>(null)
  const [irisBusy, setIrisBusy] = useState(false)
  const [irisError, setIrisError] = useState<string | null>(null)
  const [irisSummary, setIrisSummary] = useState<string | null>(null)
  const [irisJson, setIrisJson] = useState<string | null>(null)
  const [irisUrl, setIrisUrl] = useState<string | null>(null)
  const [completed, setCompleted] = useState(
    transfer.status === 'deposited' || transfer.status === 'repaid',
  )

  const amount = parseBridgeAmountHuman(transfer.amount_human)
  const needsSignature = transferNeedsSignature(transfer)
  const awaitingMint = isAwaitingMintStatus(transfer.status) && !needsSignature
  const readyToContinue = isReadyToContinueStatus(transfer.status)
  const sourceLabel = sourceChainLabel(transfer.source_chain_id, transfer.bridge_kit_source)
  const burnHref = explorerTxUrlForChain(transfer.source_chain_id, transfer.burn_tx_hash)
  const mintHref = explorerTxUrlForChain(transfer.dest_chain_id, transfer.mint_tx_hash)
  const homeTo = role === 'merchant' ? '/dashboard/merchant/overview' : '/dashboard/investor/overview'
  const listTo = trackerListPathForPurpose(transfer.purpose)
  const poolSlug = defaultInvestPoolSlug(transfer.metadata)
  const doneTo =
    transfer.purpose === 'repayment' && (transfer.loan_request_id || repayContext.loanId)
      ? merchantRepayPaths(transfer.loan_request_id || repayContext.loanId).detail
      : `/dashboard/investor/lending-pool/${poolSlug}`

  const failed = transfer.status === 'failed'
  const steps = buildBridgeSteps(transfer, sourceLabel)
  const progress = bridgeStepProgress(steps)
  const headline = failed
    ? 'This Bridge needs attention'
    : completed
      ? transfer.purpose === 'repayment'
        ? 'Repayment complete'
        : 'Investment complete'
      : needsSignature
        ? 'Sign in your wallet to start'
        : readyToContinue
          ? transfer.purpose === 'repayment'
            ? 'Ready to finish repayment'
            : 'Ready to finish investing'
          : 'Moving your USDC to Arc'

  const ensureLiveWallet = async () => {
    const live = await waitForLiveWallet(() => ({ ready, wallet, address }), {
      action: transfer.purpose === 'repayment' ? 'repay' : 'invest',
    })
    if (live.status !== 'ready') {
      const result = await reconnect(transfer.purpose === 'repayment' ? 'repay' : 'invest')
      if (result.status !== 'connected') {
        throw new Error(
          result.status === 'navigated'
            ? 'Reconnect the wallet used for this session.'
            : result.message,
        )
      }
      return null
    }
    if (!accessToken?.trim()) throw new Error('Sign in to continue.')
    return live
  }

  const handleSign = async () => {
    setError(null)
    setBusyKind('sign')
    setBusy(true)
    const originatingChainId = resolveOriginatingChainId({ authChainId, walletChainId })
    try {
      const live = await ensureLiveWallet()
      if (!live) return
      await resumeUnsignedBridgeTransfer({
        accessToken: accessToken!,
        wallet: live.wallet,
        walletAddress: live.address,
        transfer,
      })
      await queryClient.invalidateQueries({ queryKey: ['bridge-transfer'] })
      await queryClient.invalidateQueries({ queryKey: ['bridge-transfers'] })
    } catch (e) {
      setError(
        toAppUserFacingError(e, {
          fallback: 'Could not open the wallet signature.',
          context: transfer.purpose === 'repayment' ? 'repay' : 'invest',
        }),
      )
    } finally {
      const liveWallet = wallet
      if (liveWallet) await restoreWalletChainIfSafe(liveWallet, originatingChainId)
      setBusy(false)
    }
  }

  const handleContinue = async () => {
    setError(null)
    setBusyKind('continue')
    setBusy(true)
    const originatingChainId = resolveOriginatingChainId({ authChainId, walletChainId })
    try {
      const live = await ensureLiveWallet()
      if (!live) return
      await withBridgeSessionBusy(async () => {
        try {
          if (transfer.purpose === 'repayment') {
            if (!repayContext.onChainReceivableId) {
              throw new Error('This repayment is not linked to an on-chain receivable yet.')
            }
            await patchBridgeTransfer(accessToken, transfer.id, { status: 'repay_pending' })
            const txHash = await contracts.executeMerchantRepayment(
              amount,
              repayContext.onChainReceivableId,
              undefined,
              { skipBalanceGate: true },
            )
            await patchBridgeTransfer(accessToken, transfer.id, {
              status: 'repaid',
              repay_tx_hash: txHash,
            })
            void dispatch(refreshMerchantReceivables())
            void queryClient.invalidateQueries({ queryKey: ['loan-details'] })
            const loanId = transfer.loan_request_id || repayContext.loanId
            if (loanId) {
              navigate(merchantRepayPaths(loanId).detail, {
                replace: true,
                state: { paymentAmount: amount, txHash },
              })
              return
            }
          } else {
            await patchBridgeTransfer(accessToken, transfer.id, { status: 'deposit_pending' })
            const txHash = await contracts.depositFundingPool(amount, { skipBalanceGate: true })
            await patchBridgeTransfer(accessToken, transfer.id, {
              status: 'deposited',
              deposit_tx_hash: txHash,
            })
          }
          void queryClient.invalidateQueries({ queryKey: ['bridge-transfer'] })
          void queryClient.invalidateQueries({ queryKey: ['bridge-transfers'] })
          setCompleted(true)
        } finally {
          await restoreWalletChainIfSafe(live.wallet, originatingChainId)
        }
      })
    } catch (e) {
      setError(
        toAppUserFacingError(e, {
          fallback: 'Could not complete this action.',
          context: transfer.purpose === 'repayment' ? 'repay' : 'invest',
        }),
      )
    } finally {
      setBusy(false)
    }
  }

  const handleIrisCheck = async () => {
    setIrisError(null)
    if (!accessToken?.trim()) {
      setIrisError('Sign in to check this Bridge with Circle.')
      return
    }
    if (!hasBurnTx(transfer)) {
      setIrisError('Sign in wallet first. Circle can only look up a burn that already happened.')
      return
    }
    setIrisBusy(true)
    try {
      const result = await postBridgeTransferIris(accessToken, transfer.id)
      setIrisSummary(irisCheckSummary(result))
      setIrisUrl(result.iris_url || null)
      setIrisJson(JSON.stringify(result.iris, null, 2))
      if (result.applied) {
        await queryClient.invalidateQueries({ queryKey: ['bridge-transfer'] })
        await queryClient.invalidateQueries({ queryKey: ['bridge-transfers'] })
      }
    } catch (e) {
      setIrisError(
        toAppUserFacingError(e, {
          fallback: 'Could not reach Circle for this Bridge.',
          context: transfer.purpose === 'repayment' ? 'repay' : 'invest',
        }),
      )
    } finally {
      setIrisBusy(false)
    }
  }

  const continueLabel = bridgeContinueLabel(transfer.purpose)
  const signLabel = bridgeSignLabel()
  const retryAction = needsSignature ? handleSign : handleContinue
  const loadingTitle = reconnectPending
    ? 'Connecting wallet'
    : busyKind === 'sign'
      ? 'Confirm in your wallet'
      : transfer.purpose === 'repayment'
        ? 'Finishing repayment'
        : 'Finishing investment'
  const loadingDescription = reconnectPending
    ? 'Reconnect the wallet used for this session…'
    : busyKind === 'sign'
      ? `A wallet popup should appear for ${sourceLabel}. Open your wallet if you don’t see it.`
      : 'Confirm in your wallet to finish. This is the last step.'

  return (
    <>
      <DashboardRequestFeedbackLayer
        phase={busy || reconnectPending ? 'loading' : error ? 'failed' : 'idle'}
        loadingTitle={loadingTitle}
        loadingDescription={loadingDescription}
        errorTitle="Unable to continue"
        errorDescription={error ?? undefined}
        retryLabel="Try again"
        onDismiss={() => setError(null)}
        onRetry={() => void retryAction()}
      />

      <section
        className={`rounded-[10px] border p-5 sm:p-6 flex flex-col gap-5 ${
          failed ? 'border-[#FECACA] bg-[#FEF2F2]' : 'border-[#D9DEE8] bg-white'
        }`}
      >
        <div>
          <p
            className={`text-[12px] font-medium uppercase tracking-wide ${
              failed ? 'text-[#DC2626]' : readyToContinue ? 'text-[#195EBC]' : awaitingMint ? 'text-[#B45309]' : 'text-[#195EBC]'
            }`}
          >
            {failed
              ? 'Failed'
              : needsSignature
                ? 'Needs signature'
                : awaitingMint
                  ? 'Waiting'
                  : bridgeStatusLabel(transfer.status, transfer.purpose)}
          </p>
          <h2 className="text-[#0B1220] text-[22px] sm:text-[26px] font-bold leading-tight mt-1">{headline}</h2>
          <p className="text-[#0B1220] text-[28px] font-semibold leading-tight mt-3">
            {transfer.amount_human || amount} USDC
          </p>
          <p className="text-[#6B7488] text-[14px] mt-1">
            {sourceLabel} → Arc
          </p>
          <p className="text-[#6B7488] text-[13px] mt-1">{formatBridgeStartedLine(transfer)}</p>
        </div>

        <p className="text-[#4B5563] text-[14px] leading-relaxed">{bridgeStatusDescription(transfer)}</p>

        {awaitingMint && !failed && !needsSignature ? (
          <p className="rounded-[8px] bg-[#F8FAFC] border border-[#E6E8EC] px-4 py-3 text-[#6B7488] text-[13px] leading-relaxed">
            {bridgeWaitingHint()}
          </p>
        ) : null}

        <div>
          <p className="text-[#6B7488] text-[13px] mb-3">
            {progress.done} of {progress.total} complete
            {progress.left > 0 ? ` · ${progress.left} left` : ''}
            {progress.nowTitle ? ` · Now: ${progress.nowTitle}` : ''}
          </p>
          <ol className="flex flex-col gap-3" aria-label="Bridge steps">
            {steps.map((step, index) => (
              <StepRow
                key={step.id}
                index={index}
                state={step.state}
                title={step.title}
                detail={step.detail}
              />
            ))}
          </ol>
        </div>

        {burnHref || mintHref || hasBurnTx(transfer) ? (
          <div className="flex flex-col gap-3">
            {burnHref || mintHref ? (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                {burnHref ? (
                  <a href={burnHref} target="_blank" rel="noreferrer" className="text-[#195EBC] hover:underline">
                    View source transaction
                  </a>
                ) : null}
                {mintHref ? (
                  <a href={mintHref} target="_blank" rel="noreferrer" className="text-[#195EBC] hover:underline">
                    View Arc transaction
                  </a>
                ) : null}
              </div>
            ) : null}
            {hasBurnTx(transfer) ? (
              <div className="rounded-[8px] border border-[#E6E8EC] bg-[#F8FAFC] px-4 py-3 flex flex-col gap-2">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => void handleIrisCheck()}
                    disabled={irisBusy || busy}
                    className="h-[38px] px-4 rounded-[6px] bg-white border border-[#D9DEE8] text-[#195EBC] text-[14px] font-medium hover:bg-[#EEF2F6] disabled:opacity-60 self-start"
                  >
                    {irisBusy ? 'Checking Circle…' : 'Check with Circle'}
                  </button>
                  <p className="text-[#6B7488] text-[13px] leading-relaxed">
                    Pulls the latest attestation JSON from Circle for this burn.
                  </p>
                </div>
                {irisError ? <p className="text-[#DC2626] text-[13px]">{irisError}</p> : null}
                {irisSummary ? <p className="text-[#0B1220] text-[13px] leading-relaxed">{irisSummary}</p> : null}
                {irisUrl ? (
                  <a
                    href={irisUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#195EBC] text-[13px] hover:underline break-all"
                  >
                    Open Iris URL
                  </a>
                ) : null}
                {irisJson ? (
                  <details>
                    <summary className="cursor-pointer text-[#195EBC] text-[13px] font-medium">Show Circle JSON</summary>
                    <pre className="mt-2 max-h-64 overflow-auto rounded-[6px] bg-white border border-[#E6E8EC] p-3 text-[11px] leading-snug text-[#0B1220] whitespace-pre-wrap break-all">
                      {irisJson}
                    </pre>
                  </details>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {transfer.error_message ? (
          <p className="text-[#DC2626] text-[13px]">{transfer.error_message}</p>
        ) : null}

        <div className="flex flex-col sm:flex-row gap-3">
          {needsSignature && !failed ? (
            <button
              type="button"
              onClick={() => void handleSign()}
              disabled={busy || reconnectPending}
              className="h-[46px] px-5 rounded-[6px] bg-[#195EBC] text-white text-[15px] font-medium hover:bg-[#154a9a] disabled:opacity-60"
            >
              {signLabel}
            </button>
          ) : null}
          {readyToContinue && !completed ? (
            <button
              type="button"
              onClick={() => void handleContinue()}
              disabled={busy || reconnectPending}
              className="h-[46px] px-5 rounded-[6px] bg-[#195EBC] text-white text-[15px] font-medium hover:bg-[#154a9a] disabled:opacity-60"
            >
              {continueLabel}
            </button>
          ) : null}
          {completed ? (
            <Link
              to={doneTo}
              className="h-[46px] px-5 rounded-[6px] bg-[#195EBC] text-white text-[15px] font-medium inline-flex items-center justify-center hover:bg-[#154a9a]"
            >
              {transfer.purpose === 'repayment' ? 'View receivable' : 'View pool'}
            </Link>
          ) : null}
          <Link
            to={listTo}
            className="h-[46px] px-5 rounded-[6px] bg-[#EEF2F6] text-[#195EBC] text-[15px] font-medium inline-flex items-center justify-center hover:bg-[#E5ECF4]"
          >
            Back to Bridge transactions
          </Link>
          <Link
            to={homeTo}
            className="h-[46px] px-5 rounded-[6px] text-[#6B7488] text-[15px] font-medium inline-flex items-center justify-center hover:bg-[#EEF2F6]"
          >
            {awaitingMint && !completed && !failed && !needsSignature ? 'Leave for now' : 'Back to dashboard'}
          </Link>
        </div>
      </section>
    </>
  )
}
