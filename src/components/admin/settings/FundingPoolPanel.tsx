import { useCallback, useEffect, useRef, useState } from 'react'

import { toUserFacingError } from '@/api/client'
import {
  PrivilegedActionFeedbackLayer,
  submitAdminAction,
  type PrivilegedActionPhase,
  type ResolvedGovernanceOutcome,
} from '@/admin/governance'
import {
  addressesEqual,
  assertValidEthAddress,
  assertValidTokenAmount,
  assertValidWithdrawalDurationSeconds,
  assertValidWithdrawalGapSeconds,
  fetchProtocolSettingsState,
  postMultisigCreateFundingPoolMinDepositProposal,
  postMultisigCreateFundingPoolPayoutRouterProposal,
  postMultisigCreateFundingPoolWithdrawalDurationProposal,
  postMultisigCreateFundingPoolWithdrawalGapProposal,
  secondsToHumanDuration,
  tokenAmountsEqual,
} from '@/api/adminProtocolSettings'
import {
  buildDefaultFundingPool,
  type FundingPoolSettingsState,
} from '@/components/admin/settings/protocolSettingsDefaults'
import {
  SettingsField,
  SettingsPanel,
  SettingsSectionActions,
  shortAddress,
} from '@/components/admin/settings/SettingsPanel'
import { useIsStellarMode } from '@/hooks/useNetworkCapability'
import { isAbortError } from '@/utils/abortError'
import { useAppSelector } from '@/store/hooks'

function toFundingPoolDraft(
  api: Awaited<ReturnType<typeof fetchProtocolSettingsState>>,
  isStellar: boolean,
): FundingPoolSettingsState {
  const defaults = buildDefaultFundingPool(isStellar)
  return {
    minDeposit: api.fundingPool.minDeposit || defaults.minDeposit,
    payoutRouter: api.fundingPool.payoutRouter || defaults.payoutRouter,
    acceptedToken: api.fundingPool.acceptedToken || defaults.acceptedToken,
    withdrawalRequestDurationSeconds:
      api.fundingPool.withdrawalRequestDurationSeconds ||
      defaults.withdrawalRequestDurationSeconds,
    withdrawalRequestGapSeconds:
      api.fundingPool.withdrawalRequestGapSeconds || defaults.withdrawalRequestGapSeconds,
  }
}

const FundingPoolPanel = () => {
  const isStellar = useIsStellarMode()
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const [draft, setDraft] = useState<FundingPoolSettingsState>(() => buildDefaultFundingPool(false))
  const baselineRef = useRef<FundingPoolSettingsState>(buildDefaultFundingPool(false))
  const submitAbortRef = useRef<AbortController | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveNotice, setSaveNotice] = useState<string | null>(null)
  const [submitPhase, setSubmitPhase] = useState<PrivilegedActionPhase>('idle')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<ResolvedGovernanceOutcome | null>(null)

  const syncDraftToChain = useCallback((next: FundingPoolSettingsState) => {
    setDraft(next)
    baselineRef.current = next
  }, [])

  useEffect(() => {
    const defaults = buildDefaultFundingPool(isStellar)
    setDraft(defaults)
    baselineRef.current = defaults
  }, [isStellar])

  const refreshChainState = useCallback(async () => {
    if (!accessToken?.trim()) return
    const state = await fetchProtocolSettingsState(accessToken)
    syncDraftToChain(toFundingPoolDraft(state, isStellar))
    setLoadError(null)
  }, [accessToken, isStellar, syncDraftToChain])

  useEffect(() => {
    if (!accessToken?.trim()) return
    let cancelled = false
    void (async () => {
      try {
        const state = await fetchProtocolSettingsState(accessToken)
        if (cancelled) return
        syncDraftToChain(toFundingPoolDraft(state, isStellar))
        setLoadError(null)
      } catch (e) {
        if (!cancelled) {
          setLoadError(toUserFacingError(e, 'Could not load funding pool settings.'))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, isStellar, syncDraftToChain])

  const handleSave = useCallback(async () => {
    setSaveNotice(null)
    if (isStellar) {
      setSaveNotice('TradeCreditPool settings are deploy-time on Stellar Testnet (read-only here).')
      return
    }
    if (!accessToken?.trim()) {
      setSaveNotice('Sign in to submit funding pool changes.')
      return
    }

    const baseline = baselineRef.current
    const minDepositChanged = !tokenAmountsEqual(draft.minDeposit, baseline.minDeposit)
    const payoutRouterChanged = !addressesEqual(draft.payoutRouter, baseline.payoutRouter)
    const durationChanged =
      draft.withdrawalRequestDurationSeconds !== baseline.withdrawalRequestDurationSeconds
    const gapChanged = draft.withdrawalRequestGapSeconds !== baseline.withdrawalRequestGapSeconds

    if (!minDepositChanged && !payoutRouterChanged && !durationChanged && !gapChanged) {
      setSaveNotice('No funding pool changes to submit.')
      return
    }

    try {
      if (minDepositChanged) {
        assertValidTokenAmount(draft.minDeposit, 'Minimum deposit')
      }
      if (payoutRouterChanged) {
        assertValidEthAddress(draft.payoutRouter, 'Payout router address')
      }
      if (durationChanged) {
        assertValidWithdrawalDurationSeconds(draft.withdrawalRequestDurationSeconds)
      }
      if (gapChanged) {
        assertValidWithdrawalGapSeconds(draft.withdrawalRequestGapSeconds)
      }
    } catch (e) {
      setSaveNotice(toUserFacingError(e, 'Invalid funding pool values.'))
      return
    }

    setSubmitPhase('loading')
    setSubmitError(null)
    setOutcome(null)
    submitAbortRef.current?.abort()
    const controller = new AbortController()
    submitAbortRef.current = controller

    try {
      const createdProposalIds: string[] = []
      const tasks: {
        operationType:
          | 'funding_pool_min_deposit'
          | 'funding_pool_payout_router'
          | 'funding_pool_withdrawal_duration'
          | 'funding_pool_withdrawal_gap'
        run: () => Promise<ResolvedGovernanceOutcome>
      }[] = []

      if (minDepositChanged) {
        tasks.push({
          operationType: 'funding_pool_min_deposit',
          run: () =>
            submitAdminAction(
              () =>
                postMultisigCreateFundingPoolMinDepositProposal(accessToken, draft.minDeposit.trim(), {
                  signal: controller.signal,
                }),
              { operationType: 'funding_pool_min_deposit' },
            ),
        })
      }
      if (payoutRouterChanged) {
        tasks.push({
          operationType: 'funding_pool_payout_router',
          run: () =>
            submitAdminAction(
              () =>
                postMultisigCreateFundingPoolPayoutRouterProposal(accessToken, draft.payoutRouter.trim(), {
                  signal: controller.signal,
                }),
              { operationType: 'funding_pool_payout_router' },
            ),
        })
      }
      if (durationChanged) {
        tasks.push({
          operationType: 'funding_pool_withdrawal_duration',
          run: () =>
            submitAdminAction(
              () =>
                postMultisigCreateFundingPoolWithdrawalDurationProposal(
                  accessToken,
                  draft.withdrawalRequestDurationSeconds,
                  { signal: controller.signal },
                ),
              { operationType: 'funding_pool_withdrawal_duration' },
            ),
        })
      }
      if (gapChanged) {
        tasks.push({
          operationType: 'funding_pool_withdrawal_gap',
          run: () =>
            submitAdminAction(
              () =>
                postMultisigCreateFundingPoolWithdrawalGapProposal(
                  accessToken,
                  draft.withdrawalRequestGapSeconds,
                  { signal: controller.signal },
                ),
              { operationType: 'funding_pool_withdrawal_gap' },
            ),
        })
      }

      for (const task of tasks) {
        if (controller.signal.aborted) return
        const resolved = await task.run()
        if (controller.signal.aborted) return
        if (resolved.kind === 'direct_complete') {
          setOutcome(resolved)
          setSubmitPhase('succeeded')
          baselineRef.current = structuredClone(draft)
          return
        }
        if (resolved.kind === 'proposal_queued') {
          createdProposalIds.push(resolved.proposalId)
        }
      }

      if (controller.signal.aborted) return

      if (createdProposalIds.length > 0) {
        setOutcome({
          kind: 'proposal_queued',
          proposalId: createdProposalIds[0],
          message:
            createdProposalIds.length === 1
              ? 'Funding pool change proposal created.'
              : `Created ${createdProposalIds.length} governance proposals. Review the first proposal; others are in the governance queue.`,
          operationType: tasks[0]?.operationType ?? 'funding_pool_min_deposit',
        })
        setSubmitPhase('succeeded')
      } else {
        setSubmitPhase('idle')
      }
    } catch (e) {
      if (isAbortError(e) || controller.signal.aborted) {
        setSubmitPhase('idle')
        return
      }
      setSubmitError(toUserFacingError(e, 'Could not submit funding pool changes.'))
      setSubmitPhase('failed')
    } finally {
      if (submitAbortRef.current === controller) {
        submitAbortRef.current = null
      }
    }
  }, [accessToken, draft, isStellar])

  const handleDismissSubmitFeedback = useCallback(() => {
    submitAbortRef.current?.abort()
    submitAbortRef.current = null
    setSubmitPhase('idle')
    setSubmitError(null)
    setOutcome(null)
    if (!accessToken?.trim()) return
    void refreshChainState().catch(() => {
      setDraft(structuredClone(baselineRef.current))
    })
  }, [accessToken, refreshChainState])

  const handleCancelSubmitLoading = useCallback(() => {
    submitAbortRef.current?.abort()
    submitAbortRef.current = null
    setSubmitPhase('idle')
    setSubmitError(null)
    setOutcome(null)
  }, [])

  const handleCancelDraft = useCallback(() => {
    setDraft(structuredClone(baselineRef.current))
    setSaveNotice(null)
  }, [])

  const setField = <K extends keyof FundingPoolSettingsState>(
    key: K,
    value: FundingPoolSettingsState[K],
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setSaveNotice(null)
  }

  return (
    <>
      <PrivilegedActionFeedbackLayer
        phase={submitPhase}
        resolvedOutcome={outcome}
        loadingTitle="Submitting funding pool changes"
        loadingDescription="Creating multisig governance proposals for FundingPool configuration."
        errorTitle="Could not submit funding pool changes"
        errorDescription={submitError ?? undefined}
        directSuccessTitle="Funding pool updated"
        onDismiss={handleDismissSubmitFeedback}
        onRetry={() => void handleSave()}
        onCancelLoading={handleCancelSubmitLoading}
      />

      <SettingsPanel
        title={isStellar ? 'Trade Credit Pool' : 'Funding Pool'}
        description={
          isStellar
            ? 'Soroban TradeCreditPool wiring from protocol.json. Track A has no EVM withdrawal-request queue; redeem is direct.'
            : 'Pool deposit minimum and payout router wiring. Apply creates multisig proposals; on-chain state updates after execute.'
        }
        badge={isStellar ? { label: 'Read-only', variant: 'neutral' } : undefined}
        actions={
          isStellar ? undefined : (
            <SettingsSectionActions
              onCancel={handleCancelDraft}
              onSave={() => void handleSave()}
              saving={submitPhase === 'loading'}
              saveLabel="Apply"
            />
          )
        }
      >
        {loadError ? (
          <p className="text-[#B91C1C] text-[14px] rounded-[8px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3">
            {loadError}
          </p>
        ) : null}
        {saveNotice ? <p className="text-[#6B7488] text-[14px]">{saveNotice}</p> : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <SettingsField
            id="minDeposit"
            label="Minimum deposit"
            value={draft.minDeposit}
            suffix="tokens"
            hint={isStellar ? 'Protocol default for Stellar Testnet deposits.' : 'Maps to setMinDeposit.'}
            readOnly={isStellar}
            onChange={isStellar ? undefined : (v) => setField('minDeposit', v)}
          />
          <SettingsField
            id="payoutRouter"
            label="Payout router address"
            value={draft.payoutRouter}
            mono
            hint={`Current: ${shortAddress(draft.payoutRouter)}${isStellar ? '' : ' · setPayoutRouter'}`}
            readOnly={isStellar}
            onChange={isStellar ? undefined : (v) => setField('payoutRouter', v)}
          />
          <SettingsField
            id="acceptedToken"
            label={isStellar ? 'Accepted token (FISTUSD SAC)' : 'Accepted token (immutable)'}
            value={draft.acceptedToken}
            mono
            readOnly
            hint={isStellar ? 'Stellar Asset Contract for FISTUSD.' : 'Fixed at FundingPool deployment.'}
          />
          {!isStellar ? (
            <>
              <SettingsField
                id="withdrawalRequestDuration"
                label="Withdrawal request duration"
                value={String(draft.withdrawalRequestDurationSeconds)}
                suffix="seconds"
                hint={`Maps to setWithdrawalRequestDuration (${secondsToHumanDuration(draft.withdrawalRequestDurationSeconds)}). Range: 1 hour – 30 days.`}
                onChange={(v) => {
                  const n = Number(v.trim())
                  setField('withdrawalRequestDurationSeconds', Number.isFinite(n) ? n : 0)
                }}
              />
              <SettingsField
                id="withdrawalRequestGap"
                label="Withdrawal request gap"
                value={String(draft.withdrawalRequestGapSeconds)}
                suffix="seconds"
                hint={`Maps to setWithdrawalRequestGap (${secondsToHumanDuration(draft.withdrawalRequestGapSeconds)}). Range: 1 minute – 1 day.`}
                onChange={(v) => {
                  const n = Number(v.trim())
                  setField('withdrawalRequestGapSeconds', Number.isFinite(n) ? n : 0)
                }}
              />
            </>
          ) : null}
        </div>
      </SettingsPanel>
    </>
  )
}

export default FundingPoolPanel
