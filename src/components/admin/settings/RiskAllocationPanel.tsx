import { useCallback, useEffect, useRef, useState } from 'react'

import { postMultisigCreateRiskTierProposal } from '@/api/multisig/proposals'
import {
  assertValidBankerYearDays,
  assertValidMaxMerchantBps,
  assertValidMaxTenorRateBps,
  bpsToPercent,
  fetchProtocolSettingsState,
  percentToBps,
  percentValuesEqual,
  postMultisigCreateAllocationBankerYearDaysProposal,
  postMultisigCreateAllocationMaxTenorRateBpsProposal,
  postMultisigCreateMaxMerchantBpsProposal,
  resolveMaxMerchantPercentFromBps,
} from '@/api/adminProtocolSettings'
import { fetchRiskTiers } from '@/api/riskTiers'
import { toUserFacingError } from '@/api/client'
import {
  PrivilegedActionFeedbackLayer,
  buildRiskTierProposalBody,
  submitAdminAction,
  type PrivilegedActionPhase,
  type ResolvedGovernanceOutcome,
} from '@/admin/governance'
import { isAbortError } from '@/utils/abortError'
import type { ProtocolRiskTier, RiskAllocationState } from '@/components/admin/settings/protocolSettingsDefaults'
import { DEFAULT_RISK_ALLOCATION } from '@/components/admin/settings/protocolSettingsDefaults'
import {
  SettingsField,
  SettingsPanel,
  SettingsSectionActions,
} from '@/components/admin/settings/SettingsPanel'
import { AdminStatusPill } from '@/components/admin/primitives'
import { useIsStellarMode } from '@/hooks/useNetworkCapability'
import { useAppSelector } from '@/store/hooks'

function nextTierId(tiers: ProtocolRiskTier[]): number {
  if (tiers.length === 0) return 1
  return Math.max(...tiers.map((t) => t.id)) + 1
}

function createDefaultTier(id: number): ProtocolRiskTier {
  return {
    id,
    interestPercent: '10',
    maxTenorDays: '90',
    active: true,
  }
}

function tierSnapshotKey(tier: ProtocolRiskTier): string {
  return `${tier.id}|${tier.interestPercent}|${tier.maxTenorDays}|${tier.active}`
}

function findChangedTiers(baseline: ProtocolRiskTier[], next: ProtocolRiskTier[]): ProtocolRiskTier[] {
  const baselineById = new Map(baseline.map((t) => [t.id, tierSnapshotKey(t)]))
  const changed: ProtocolRiskTier[] = []
  for (const tier of next) {
    const prev = baselineById.get(tier.id)
    if (!prev || prev !== tierSnapshotKey(tier)) {
      changed.push(tier)
    }
  }
  return changed
}

const RiskAllocationPanel = () => {
  const isStellar = useIsStellarMode()
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const sessionChainId = useAppSelector((s) => s.auth.chainId)
  const [draft, setDraft] = useState<RiskAllocationState>(() => structuredClone(DEFAULT_RISK_ALLOCATION))
  const baselineTiersRef = useRef<ProtocolRiskTier[]>(DEFAULT_RISK_ALLOCATION.tiers)
  const baselineMaxMerchantRef = useRef<string>(DEFAULT_RISK_ALLOCATION.maxMerchantPercent)
  const baselineMaxMerchantBpsRef = useRef<number>(percentToBps(DEFAULT_RISK_ALLOCATION.maxMerchantPercent))
  const [onChainMaxMerchantBps, setOnChainMaxMerchantBps] = useState<number | null>(null)
  const baselineBankerYearDaysRef = useRef<string>(DEFAULT_RISK_ALLOCATION.bankerYearDays)
  const baselineMaxTenorRateRef = useRef<string>(DEFAULT_RISK_ALLOCATION.maxTenorRatePercent)
  const submitAbortRef = useRef<AbortController | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveNotice, setSaveNotice] = useState<string | null>(null)
  const [submitPhase, setSubmitPhase] = useState<PrivilegedActionPhase>('idle')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<ResolvedGovernanceOutcome | null>(null)

  const syncBaseline = useCallback((next: RiskAllocationState, maxMerchantBps?: number | null) => {
    setDraft(next)
    baselineTiersRef.current = structuredClone(next.tiers)
    baselineMaxMerchantRef.current = next.maxMerchantPercent
    baselineMaxMerchantBpsRef.current = percentToBps(next.maxMerchantPercent)
    baselineBankerYearDaysRef.current = next.bankerYearDays
    baselineMaxTenorRateRef.current = next.maxTenorRatePercent
    if (maxMerchantBps != null && maxMerchantBps > 0) {
      setOnChainMaxMerchantBps(maxMerchantBps)
    }
  }, [])

  const mapSettingsToDraft = useCallback(
    (
      tiers: ProtocolRiskTier[],
      settings: Awaited<ReturnType<typeof fetchProtocolSettingsState>> | null,
    ): RiskAllocationState => {
      const maxMerchantBps = settings?.riskAllocator.maxMerchantBps ?? 0
      return {
        maxMerchantPercent: settings
          ? resolveMaxMerchantPercentFromBps(
              maxMerchantBps,
              DEFAULT_RISK_ALLOCATION.maxMerchantPercent,
            )
          : DEFAULT_RISK_ALLOCATION.maxMerchantPercent,
        bankerYearDays: settings
          ? String(settings.riskAllocator.bankerYearDays || DEFAULT_RISK_ALLOCATION.bankerYearDays)
          : DEFAULT_RISK_ALLOCATION.bankerYearDays,
        maxTenorRatePercent: settings
          ? bpsToPercent(settings.riskAllocator.maxTenorRateBps)
          : DEFAULT_RISK_ALLOCATION.maxTenorRatePercent,
        tiers,
      }
    },
    [],
  )

  const applyLoadedState = useCallback(
    (
      tiers: ProtocolRiskTier[],
      settings: Awaited<ReturnType<typeof fetchProtocolSettingsState>> | null,
      settingsError: string | null,
    ) => {
      const next = mapSettingsToDraft(tiers, settings)
      syncBaseline(next, settings?.riskAllocator.maxMerchantBps ?? null)
      setLoadError(settingsError)
    },
    [mapSettingsToDraft, syncBaseline],
  )

  const refreshChainState = useCallback(async () => {
    const [tiersResult, settingsResult] = await Promise.allSettled([
      fetchRiskTiers(sessionChainId),
      accessToken?.trim() ? fetchProtocolSettingsState(accessToken) : Promise.resolve(null),
    ])

    const tiers = tiersResult.status === 'fulfilled' ? tiersResult.value : []
    const settings = settingsResult.status === 'fulfilled' ? settingsResult.value : null
    const settingsError =
      settingsResult.status === 'rejected'
        ? toUserFacingError(settingsResult.reason, 'Could not load on-chain allocation settings.')
        : tiersResult.status === 'rejected'
          ? toUserFacingError(tiersResult.reason, 'Could not load risk tiers.')
          : null

    const mapped =
      tiers.length > 0
        ? tiers.map((t) => ({
            id: t.id,
            interestPercent: String(t.interest_percent),
            maxTenorDays: String(t.duration_days),
            active: t.active,
          }))
        : structuredClone(DEFAULT_RISK_ALLOCATION.tiers)

    applyLoadedState(mapped, settings, settingsError)
  }, [accessToken, applyLoadedState, sessionChainId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [tiersResult, settingsResult] = await Promise.allSettled([
        fetchRiskTiers(sessionChainId),
        accessToken?.trim() ? fetchProtocolSettingsState(accessToken) : Promise.resolve(null),
      ])
      if (cancelled) return

      const tiers = tiersResult.status === 'fulfilled' ? tiersResult.value : []
      const settings = settingsResult.status === 'fulfilled' ? settingsResult.value : null
      const settingsError =
        settingsResult.status === 'rejected'
          ? toUserFacingError(settingsResult.reason, 'Could not load on-chain allocation settings.')
          : tiersResult.status === 'rejected'
            ? toUserFacingError(tiersResult.reason, 'Could not load risk tiers.')
            : null

      const mapped =
        tiers.length > 0
          ? tiers.map((t) => ({
              id: t.id,
              interestPercent: String(t.interest_percent),
              maxTenorDays: String(t.duration_days),
              active: t.active,
            }))
          : structuredClone(DEFAULT_RISK_ALLOCATION.tiers)

      applyLoadedState(mapped, settings, settingsError)
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, applyLoadedState, sessionChainId])

  const handleSave = useCallback(async () => {
    setSaveNotice(null)
    if (isStellar) {
      setSaveNotice('Risk tiers are configured in protocol.json on Stellar Testnet (read-only here).')
      return
    }
    if (!accessToken?.trim()) {
      setSaveNotice('Sign in to submit risk allocation changes.')
      return
    }

    const changedTiers = findChangedTiers(baselineTiersRef.current, draft.tiers)
    const draftMaxMerchantBps = percentToBps(draft.maxMerchantPercent)
    const maxMerchantChanged = draftMaxMerchantBps !== baselineMaxMerchantBpsRef.current
    const bankerYearChanged =
      draft.bankerYearDays.trim() !== baselineBankerYearDaysRef.current.trim()
    const maxTenorRateChanged =
      !percentValuesEqual(draft.maxTenorRatePercent, baselineMaxTenorRateRef.current)

    if (
      changedTiers.length === 0 &&
      !maxMerchantChanged &&
      !bankerYearChanged &&
      !maxTenorRateChanged
    ) {
      setSaveNotice('No risk allocation changes to submit.')
      return
    }

    try {
      if (maxMerchantChanged) {
        assertValidMaxMerchantBps(draftMaxMerchantBps)
      }
      if (bankerYearChanged) {
        const days = Number(draft.bankerYearDays.trim())
        assertValidBankerYearDays(days)
      }
      if (maxTenorRateChanged) {
        assertValidMaxTenorRateBps(percentToBps(draft.maxTenorRatePercent))
      }
    } catch (e) {
      setSaveNotice(toUserFacingError(e, 'Invalid risk allocation values.'))
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
          | 'max_merchant_bps'
          | 'allocation_banker_year_days'
          | 'allocation_max_tenor_rate_bps'
          | 'risk_tier'
        run: () => Promise<ResolvedGovernanceOutcome>
      }[] = []

      if (maxMerchantChanged) {
        tasks.push({
          operationType: 'max_merchant_bps',
          run: () =>
            submitAdminAction(
              () =>
                postMultisigCreateMaxMerchantBpsProposal(
                  accessToken,
                  draftMaxMerchantBps,
                  { signal: controller.signal },
                ),
              { operationType: 'max_merchant_bps' },
            ),
        })
      }

      if (bankerYearChanged) {
        tasks.push({
          operationType: 'allocation_banker_year_days',
          run: () =>
            submitAdminAction(
              () =>
                postMultisigCreateAllocationBankerYearDaysProposal(
                  accessToken,
                  Number(draft.bankerYearDays.trim()),
                  { signal: controller.signal },
                ),
              { operationType: 'allocation_banker_year_days' },
            ),
        })
      }

      if (maxTenorRateChanged) {
        tasks.push({
          operationType: 'allocation_max_tenor_rate_bps',
          run: () =>
            submitAdminAction(
              () =>
                postMultisigCreateAllocationMaxTenorRateBpsProposal(
                  accessToken,
                  percentToBps(draft.maxTenorRatePercent),
                  { signal: controller.signal },
                ),
              { operationType: 'allocation_max_tenor_rate_bps' },
            ),
        })
      }

      for (const tier of changedTiers) {
        tasks.push({
          operationType: 'risk_tier',
          run: () =>
            submitAdminAction(
              () =>
                postMultisigCreateRiskTierProposal(
                  accessToken,
                  buildRiskTierProposalBody({
                    tierId: tier.id,
                    interestPercent: Number(tier.interestPercent),
                    maxTenorDays: Number(tier.maxTenorDays),
                    active: tier.active,
                  }),
                  { signal: controller.signal },
                ),
              { operationType: 'risk_tier' },
            ),
        })
      }

      const syncBaselinesFromDraft = () => {
        baselineMaxMerchantRef.current = draft.maxMerchantPercent.trim()
        baselineMaxMerchantBpsRef.current = draftMaxMerchantBps
        baselineBankerYearDaysRef.current = draft.bankerYearDays.trim()
        baselineMaxTenorRateRef.current = draft.maxTenorRatePercent.trim()
        baselineTiersRef.current = structuredClone(draft.tiers)
      }

      for (const task of tasks) {
        if (controller.signal.aborted) return
        const resolved = await task.run()
        if (controller.signal.aborted) return
        if (resolved.kind === 'direct_complete') {
          setOutcome(resolved)
          setSubmitPhase('succeeded')
          syncBaselinesFromDraft()
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
              ? 'Risk allocation change proposal created.'
              : `Created ${createdProposalIds.length} governance proposals. Review the first proposal; others are in the governance queue.`,
          operationType: tasks[0]?.operationType ?? 'max_merchant_bps',
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
      setSubmitError(toUserFacingError(e, 'Could not submit risk allocation changes.'))
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
    void refreshChainState().catch(() => {
      setDraft({
        maxMerchantPercent: baselineMaxMerchantRef.current,
        bankerYearDays: baselineBankerYearDaysRef.current,
        maxTenorRatePercent: baselineMaxTenorRateRef.current,
        tiers: structuredClone(baselineTiersRef.current),
      })
    })
  }, [refreshChainState])

  const handleCancelSubmitLoading = useCallback(() => {
    submitAbortRef.current?.abort()
    submitAbortRef.current = null
    setSubmitPhase('idle')
    setSubmitError(null)
    setOutcome(null)
  }, [])

  const handleCancelDraft = useCallback(() => {
    setDraft({
      maxMerchantPercent: baselineMaxMerchantRef.current,
      bankerYearDays: baselineBankerYearDaysRef.current,
      maxTenorRatePercent: baselineMaxTenorRateRef.current,
      tiers: structuredClone(baselineTiersRef.current),
    })
    setSaveNotice(null)
  }, [])

  const updateTier = (id: number, patch: Partial<ProtocolRiskTier>) => {
    setDraft((prev) => ({
      ...prev,
      tiers: prev.tiers.map((tier) => (tier.id === id ? { ...tier, ...patch } : tier)),
    }))
    setSaveNotice(null)
  }

  const toggleTierActive = (id: number) => {
    setDraft((prev) => ({
      ...prev,
      tiers: prev.tiers.map((tier) =>
        tier.id === id ? { ...tier, active: !tier.active } : tier,
      ),
    }))
    setSaveNotice(null)
  }

  const addTier = useCallback(() => {
    setDraft((prev) => {
      const id = nextTierId(prev.tiers)
      return {
        ...prev,
        tiers: [...prev.tiers, createDefaultTier(id)],
      }
    })
    setSaveNotice(null)
  }, [])

  const removeTier = useCallback(
    (id: number) => {
      const tier = draft.tiers.find((t) => t.id === id)
      const label = tier ? `tier ${tier.id}` : 'this tier'
      if (!window.confirm(`Remove ${label} from the list? Apply to submit on-chain via setRiskTier.`)) {
        return
      }
      setDraft((prev) => ({
        ...prev,
        tiers: prev.tiers.filter((tier) => tier.id !== id),
      }))
      setSaveNotice(null)
    },
    [draft.tiers],
  )

  return (
    <>
      <SettingsPanel
        title="Risk & Allocation"
        description={
          isStellar
            ? 'Risk tiers from Stellar protocol.json (Track A). Interest is a flat percent of principal for the tenor. Editable governance setters are EVM-only.'
            : 'Risk tiers and merchant concentration limits on AllocationController. Tier interest is a flat percent of principal for the full tenor (not APR). Each changed field creates a multisig governance proposal.'
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
        {loadError ? <p className="text-[#DC2626] text-[14px]">{loadError}</p> : null}
        {saveNotice ? <p className="text-[#6B7488] text-[14px]">{saveNotice}</p> : null}
        {!isStellar ? (
          <>
            <SettingsField
              id="maxMerchantPercent"
              label="Max merchant concentration"
              value={draft.maxMerchantPercent}
              suffix="%"
              hint={
                onChainMaxMerchantBps != null
                  ? `On-chain: ${onChainMaxMerchantBps} bps (${bpsToPercent(onChainMaxMerchantBps)}%). Apply creates a max_merchant_bps governance proposal via setMaxMerchantBps.`
                  : 'Maps to setMaxMerchantBps (0–100%). Apply creates a max_merchant_bps governance proposal.'
              }
              onChange={(v) => {
                setDraft((prev) => ({ ...prev, maxMerchantPercent: v }))
                setSaveNotice(null)
              }}
            />
            <SettingsField
              id="bankerYearDays"
              label="Banker year days"
              value={draft.bankerYearDays}
              hint="Legacy day-count field on AllocationController. New flat tenor interest does not use banker year days for loan pricing."
              onChange={(v) => {
                setDraft((prev) => ({ ...prev, bankerYearDays: v }))
                setSaveNotice(null)
              }}
            />
            <SettingsField
              id="maxTenorRatePercent"
              label="Max tenor rate"
              value={draft.maxTenorRatePercent}
              suffix="%"
              hint="Maps to setMaxTenorRateBps (0–100%)."
              onChange={(v) => {
                setDraft((prev) => ({ ...prev, maxTenorRatePercent: v }))
                setSaveNotice(null)
              }}
            />
          </>
        ) : null}

        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 className="text-[#0B1220] text-[15px] font-semibold">Risk tiers</h3>
            {!isStellar ? (
              <button
                type="button"
                onClick={addTier}
                className="h-9 px-4 rounded-[6px] border border-[#195EBC] text-[#195EBC] text-[13px] font-semibold hover:bg-[#E8EFFB] transition-colors"
              >
                Add risk tier
              </button>
            ) : null}
          </div>

          {draft.tiers.length === 0 ? (
            <div className="rounded-[8px] border border-dashed border-[#D1D5DB] bg-[#FAFBFC] px-5 py-10 text-center">
              <p className="text-[#6B7488] text-[14px]">No risk tiers configured.</p>
              {!isStellar ? (
                <button
                  type="button"
                  onClick={addTier}
                  className="mt-3 text-[#195EBC] text-[14px] font-semibold hover:underline"
                >
                  Add your first tier
                </button>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[8px] border border-[#E6E8EC]">
              <table className="min-w-[720px] w-full text-left text-[14px]">
                <thead className="bg-[#F8F9FB] text-[#6B7488] text-[12px] font-semibold uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3">Tier ID</th>
                    <th className="px-4 py-3">Tenor rate (%)</th>
                    <th className="px-4 py-3">Max tenor (days)</th>
                    <th className="px-4 py-3">Status</th>
                    {!isStellar ? (
                      <>
                        <th className="px-4 py-3">Active</th>
                        <th className="px-4 py-3">Actions</th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {draft.tiers.map((tier) => (
                    <tr key={tier.id} className="border-t border-[#EEF0F4]">
                      <td className="px-4 py-3 font-mono font-medium text-[#0B1220]">{tier.id}</td>
                      <td className="px-4 py-3">
                        {isStellar ? (
                          <span>{tier.interestPercent}</span>
                        ) : (
                          <input
                            type="text"
                            inputMode="decimal"
                            value={tier.interestPercent}
                            onChange={(e) => updateTier(tier.id, { interestPercent: e.target.value })}
                            className="h-9 w-24 rounded-[6px] bg-[#F0F2F5] px-2 text-[14px] outline-none focus:ring-2 focus:ring-[#195EBC]/25"
                            aria-label={`Tier ${tier.id} tenor rate`}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isStellar ? (
                          <span>{tier.maxTenorDays}</span>
                        ) : (
                          <input
                            type="text"
                            inputMode="numeric"
                            value={tier.maxTenorDays}
                            onChange={(e) => updateTier(tier.id, { maxTenorDays: e.target.value })}
                            className="h-9 w-24 rounded-[6px] bg-[#F0F2F5] px-2 text-[14px] outline-none focus:ring-2 focus:ring-[#195EBC]/25"
                            aria-label={`Tier ${tier.id} max tenor days`}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <AdminStatusPill variant={tier.active ? 'active' : 'neutral'}>
                          {tier.active ? 'Active' : 'Inactive'}
                        </AdminStatusPill>
                      </td>
                      {!isStellar ? (
                        <>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => toggleTierActive(tier.id)}
                              className="text-[#195EBC] text-[13px] font-semibold hover:underline"
                            >
                              {tier.active ? 'Deactivate' : 'Activate'}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => removeTier(tier.id)}
                              className="text-[#DC2626] text-[13px] font-semibold hover:underline"
                            >
                              Delete
                            </button>
                          </td>
                        </>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-2 text-[12px] text-[#9CA3AF]">
            {isStellar
              ? 'Tiers are defined in utils/config/chains/1397037394/protocol.json for Stellar Testnet.'
              : 'Only changed fields are submitted. Each change creates a separate governance proposal for multisig signatures.'}
          </p>
        </div>
      </SettingsPanel>

      <PrivilegedActionFeedbackLayer
        phase={submitPhase}
        resolvedOutcome={outcome}
        loadingTitle="Submitting risk allocation changes"
        loadingDescription="Creating multisig governance proposals for AllocationController settings…"
        errorTitle="Unable to submit risk allocation changes"
        errorDescription={submitError ?? undefined}
        directSuccessTitle="Risk allocation changes submitted"
        onDismiss={handleDismissSubmitFeedback}
        onRetry={() => void handleSave()}
        onCancelLoading={handleCancelSubmitLoading}
      />
    </>
  )
}

export default RiskAllocationPanel
