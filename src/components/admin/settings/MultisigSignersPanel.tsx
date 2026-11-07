import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { toUserFacingError } from '@/api/client'
import {
  AdminGovernanceStatusBadge,
  PrivilegedActionFeedbackLayer,
  submitAdminAction,
  type PrivilegedActionPhase,
  type ResolvedGovernanceOutcome,
} from '@/admin/governance'
import {
  computeProjectedSignerCount,
  isValidEthAddress,
  isZeroAddress,
  validateAddSignersOnly,
  validateRemoveSignersOnly,
  validateSignerRotationDraft,
  validateThresholdOnly,
} from '@/admin/governance/multisigSignerValidation'
import {
  postMultisigCreateAddSignersProposal,
  postMultisigCreateRemoveSignersProposal,
  postMultisigCreateSetThresholdProposal,
  postMultisigCreateSignerRotationProposal,
} from '@/api/multisig/proposals'
import { blockExplorerAddressUrl, getDefaultBlockExplorerBase } from '@/api/payout'
import type { OperationType } from '@/api/types/multisig'
import { GOVERNANCE_FULL_LIST_FILTER } from '@/admin/governance/governanceListCache'
import {
  SettingsField,
  SettingsPanel,
  SettingsSectionActions,
  shortAddress,
} from '@/components/admin/settings/SettingsPanel'
import { isAbortError } from '@/utils/abortError'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  hasActiveGovernanceProposals,
  refreshMultisigConfig,
  refreshMultisigProposals,
} from '@/store/slices/adminMultisigSlice'
import { useActiveWallet } from '@/wallet/useActiveWallet'

const SIGNER_CONFIRM_MESSAGE =
  'This will create a multisig governance proposal. Existing owners must sign before changes take effect. Removing an owner invalidates their signatures on pending proposals.'

const MultisigSignersPanel = () => {
  const dispatch = useAppDispatch()
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const { config, configStatus, proposals } = useAppSelector((s) => s.adminMultisig)
  const { address: connectedAddress } = useActiveWallet()
  const isStellar =
    config?.vm === 'soroban' ||
    config?.executionMode === 'stellar_direct' ||
    config?.executionMode === 'stellar_multisig' ||
    (config?.multisigAddress || '').startsWith('C')
  const stellarReadOnly = isStellar && !(config?.capabilities?.addRemoveSigners)

  const [addAddressInput, setAddAddressInput] = useState('')
  const [addAddresses, setAddAddresses] = useState<string[]>([])
  const [removeAddresses, setRemoveAddresses] = useState<string[]>([])
  const [draftThreshold, setDraftThreshold] = useState(1)
  const baselineThresholdRef = useRef(1)

  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveNotice, setSaveNotice] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingSubmit, setPendingSubmit] = useState<(() => Promise<void>) | null>(null)
  const submitAbortRef = useRef<AbortController | null>(null)

  const [submitPhase, setSubmitPhase] = useState<PrivilegedActionPhase>('idle')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<ResolvedGovernanceOutcome | null>(null)
  const [pendingProposalId, setPendingProposalId] = useState<string | null>(null)
  const [pendingOperationType, setPendingOperationType] = useState<OperationType | null>(null)

  const explorerBase = getDefaultBlockExplorerBase()
  const signers = config?.signers ?? []
  const currentThreshold = config?.threshold ?? 1

  const syncDraftFromConfig = useCallback(() => {
    if (!config) return
    setAddAddresses([])
    setRemoveAddresses([])
    setAddAddressInput('')
    setDraftThreshold(config.threshold)
    baselineThresholdRef.current = config.threshold
  }, [config])

  useEffect(() => {
    if (!accessToken?.trim()) return
    void dispatch(refreshMultisigConfig())
    void dispatch(refreshMultisigProposals({ ...GOVERNANCE_FULL_LIST_FILTER, background: true }))
  }, [dispatch, accessToken])

  useEffect(() => {
    if (config) {
      syncDraftFromConfig()
      setLoadError(null)
    }
  }, [config, syncDraftFromConfig])

  useEffect(() => {
    if (configStatus === 'failed' && !config) {
      setLoadError('Could not load multisig config.')
    }
  }, [configStatus, config])

  const projectedSignerCount = useMemo(
    () => computeProjectedSignerCount(signers, addAddresses, removeAddresses),
    [signers, addAddresses, removeAddresses],
  )

  const hasOpenProposals = useMemo(() => hasActiveGovernanceProposals(proposals), [proposals])

  const thresholdChanged = draftThreshold !== baselineThresholdRef.current
  const hasRotationChanges =
    addAddresses.length > 0 || removeAddresses.length > 0 || thresholdChanged

  const removingConnectedWallet = useMemo(() => {
    if (!connectedAddress) return false
    const low = connectedAddress.toLowerCase()
    return removeAddresses.some((a) => a.toLowerCase() === low)
  }, [connectedAddress, removeAddresses])

  const multisigExplorerHref =
    explorerBase && config?.multisigAddress
      ? blockExplorerAddressUrl(explorerBase, config.multisigAddress)
      : null

  const handleAddAddressToList = () => {
    setSaveNotice(null)
    const addr = addAddressInput.trim()
    if (!addr) return
    if (!isValidEthAddress(addr) || isZeroAddress(addr)) {
      setSaveNotice('Enter a valid non-zero Ethereum address.')
      return
    }
    if (addAddresses.some((a) => a.toLowerCase() === addr.toLowerCase())) {
      setSaveNotice('Address already in add list.')
      return
    }
    if (signers.some((s) => s.toLowerCase() === addr.toLowerCase())) {
      setSaveNotice('Address is already a signer.')
      return
    }
    setAddAddresses((prev) => [...prev, addr])
    setAddAddressInput('')
  }

  const toggleRemoveSigner = (addr: string) => {
    setSaveNotice(null)
    setRemoveAddresses((prev) => {
      const low = addr.toLowerCase()
      if (prev.some((a) => a.toLowerCase() === low)) {
        return prev.filter((a) => a.toLowerCase() !== low)
      }
      return [...prev, addr]
    })
  }

  const runSubmit = useCallback(
    async (operationType: OperationType, action: () => Promise<ResolvedGovernanceOutcome>) => {
      setSaveNotice(null)
      if (!accessToken?.trim()) {
        setSaveNotice('Sign in to manage multisig owners.')
        return
      }

      setSubmitPhase('loading')
      setSubmitError(null)
      setOutcome(null)
      submitAbortRef.current?.abort()
      const controller = new AbortController()
      submitAbortRef.current = controller

      try {
        const resolved = await action()
        if (controller.signal.aborted) return

        setOutcome(resolved)
        setSubmitPhase('succeeded')
        setPendingOperationType(operationType)

        if (resolved.kind === 'proposal_queued') {
          setPendingProposalId(resolved.proposalId)
        } else {
          setPendingProposalId(null)
          void dispatch(refreshMultisigConfig())
        }
      } catch (e) {
        if (isAbortError(e) || controller.signal.aborted) {
          setSubmitPhase('idle')
          return
        }
        setSubmitError(toUserFacingError(e, 'Could not submit multisig owner change.'))
        setSubmitPhase('failed')
      } finally {
        if (submitAbortRef.current === controller) {
          submitAbortRef.current = null
        }
      }
    },
    [accessToken, dispatch],
  )

  const submitRotation = useCallback(async () => {
    const validation = validateSignerRotationDraft(
      { addAddresses, removeAddresses, threshold: draftThreshold },
      signers,
      currentThreshold,
    )
    if (!validation.ok) {
      setSaveNotice(validation.message)
      return
    }

    const body: { add_addresses?: string[]; remove_addresses?: string[]; threshold?: number } = {}
    if (addAddresses.length) body.add_addresses = addAddresses
    if (removeAddresses.length) body.remove_addresses = removeAddresses
    if (thresholdChanged) body.threshold = draftThreshold

    await runSubmit('multisig_signer_rotation', () =>
      submitAdminAction(
        () => postMultisigCreateSignerRotationProposal(accessToken, body),
        { operationType: 'multisig_signer_rotation' },
      ),
    )
  }, [
    addAddresses,
    removeAddresses,
    draftThreshold,
    signers,
    currentThreshold,
    thresholdChanged,
    accessToken,
    runSubmit,
  ])

  const submitAddOnly = useCallback(async () => {
    const validation = validateAddSignersOnly(addAddresses, signers, currentThreshold)
    if (!validation.ok) {
      setSaveNotice(validation.message)
      return
    }
    await runSubmit('multisig_add_signers', () =>
      submitAdminAction(
        () => postMultisigCreateAddSignersProposal(accessToken, { addresses: addAddresses }),
        { operationType: 'multisig_add_signers' },
      ),
    )
  }, [addAddresses, signers, currentThreshold, accessToken, runSubmit])

  const submitRemoveOnly = useCallback(async () => {
    const validation = validateRemoveSignersOnly(removeAddresses, signers, currentThreshold)
    if (!validation.ok) {
      setSaveNotice(validation.message)
      return
    }
    await runSubmit('multisig_remove_signers', () =>
      submitAdminAction(
        () => postMultisigCreateRemoveSignersProposal(accessToken, { addresses: removeAddresses }),
        { operationType: 'multisig_remove_signers' },
      ),
    )
  }, [removeAddresses, signers, currentThreshold, accessToken, runSubmit])

  const submitThresholdOnly = useCallback(async () => {
    const validation = validateThresholdOnly(draftThreshold, signers, currentThreshold)
    if (!validation.ok) {
      setSaveNotice(validation.message)
      return
    }
    await runSubmit('multisig_set_threshold', () =>
      submitAdminAction(
        () => postMultisigCreateSetThresholdProposal(accessToken, { threshold: draftThreshold }),
        { operationType: 'multisig_set_threshold' },
      ),
    )
  }, [draftThreshold, signers, currentThreshold, accessToken, runSubmit])

  const needsConfirm = (mode: 'rotation' | 'add' | 'remove' | 'threshold') => {
    if (mode === 'remove' || mode === 'rotation') {
      if (removeAddresses.length > 0) return true
    }
    if (mode === 'threshold' || mode === 'rotation') {
      if (thresholdChanged && draftThreshold > currentThreshold) return true
    }
    return false
  }

  const requestSubmit = (mode: 'rotation' | 'add' | 'remove' | 'threshold', fn: () => Promise<void>) => {
    if (needsConfirm(mode)) {
      setPendingSubmit(() => fn)
      setConfirmOpen(true)
      return
    }
    void fn()
  }

  const handleDismissSubmitFeedback = useCallback(() => {
    submitAbortRef.current?.abort()
    submitAbortRef.current = null
    setSubmitPhase('idle')
    setSubmitError(null)
    setOutcome(null)
    setPendingOperationType(null)
    if (!accessToken?.trim()) return
    void dispatch(refreshMultisigConfig()).then(() => {
      setPendingProposalId(null)
      syncDraftFromConfig()
    })
  }, [accessToken, dispatch, syncDraftFromConfig])

  const handleCancelDraft = useCallback(() => {
    syncDraftFromConfig()
    setSaveNotice(null)
  }, [syncDraftFromConfig])

  const loading = configStatus === 'loading' && !config

  return (
    <>
      {confirmOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/25 backdrop-blur-[2px] p-5">
          <div
            role="dialog"
            aria-labelledby="signer-change-title"
            className="w-full max-w-md rounded-[12px] bg-white p-6 shadow-xl"
          >
            <h3 id="signer-change-title" className="text-[#0B1220] text-[18px] font-bold">
              Create signer change proposal?
            </h3>
            <p className="mt-2 text-[#6B7488] text-[14px]">{SIGNER_CONFIRM_MESSAGE}</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false)
                  setPendingSubmit(null)
                }}
                className="h-11 rounded-[8px] bg-[#E8EFFB] text-[#195EBC] text-[14px] font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false)
                  const fn = pendingSubmit
                  setPendingSubmit(null)
                  if (fn) void fn()
                }}
                className="h-11 rounded-[8px] bg-[#195EBC] text-white text-[14px] font-semibold"
              >
                Create proposal
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <PrivilegedActionFeedbackLayer
        phase={submitPhase}
        resolvedOutcome={outcome}
        loadingTitle="Submitting multisig owner change"
        loadingDescription="Creating a multisig governance proposal for signer management."
        errorTitle="Could not submit signer change"
        errorDescription={submitError ?? undefined}
        directSuccessTitle="Signer change submitted"
        onDismiss={handleDismissSubmitFeedback}
        onRetry={() => {
          if (pendingOperationType === 'multisig_add_signers') void submitAddOnly()
          else if (pendingOperationType === 'multisig_remove_signers') void submitRemoveOnly()
          else if (pendingOperationType === 'multisig_set_threshold') void submitThresholdOnly()
          else void submitRotation()
        }}
        onCancelLoading={() => {
          submitAbortRef.current?.abort()
          submitAbortRef.current = null
          setSubmitPhase('idle')
          setSubmitError(null)
          setOutcome(null)
        }}
      />

      <SettingsPanel
        title={isStellar ? 'FistMultisig owners' : 'Multisig owners'}
        description={
          stellarReadOnly
            ? `Stellar 1-of-1 governance account${config?.multisigAddress ? ` (${config.multisigAddress})` : ''}. Owner rotation is not enabled yet; ${config?.message || 'admin ops follow executionMode.'}`
            : 'View on-chain owners and threshold. Apply creates a governance proposal; changes take effect only after owners sign and the proposal is executed.'
        }
        badge={
          config
            ? {
                label: stellarReadOnly
                  ? `${config.threshold}-of-${config.signerCount || signers.length} · read-only`
                  : `${config.threshold}-of-${config.signerCount || signers.length}`,
                variant: 'approved',
              }
            : undefined
        }
        actions={
          stellarReadOnly ? undefined : (
            <SettingsSectionActions
              onCancel={handleCancelDraft}
              onSave={() => requestSubmit('rotation', submitRotation)}
              saving={submitPhase === 'loading'}
              saveLabel="Apply rotation"
              disabled={!hasRotationChanges || loading}
            />
          )
        }
      >
        {loadError ? (
          <p className="text-[#B91C1C] text-[14px] rounded-[8px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3">
            {loadError}
          </p>
        ) : null}
        {loading ? (
          <p className="text-[#6B7488] text-[14px]">Loading multisig config…</p>
        ) : null}
        {saveNotice ? <p className="text-[#B91C1C] text-[14px]">{saveNotice}</p> : null}

        {hasOpenProposals ? (
          <p className="text-[#92400E] text-[13px] rounded-[8px] border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3">
            Open governance proposals are pending. Consider completing them before changing owners — removing a
            signer invalidates their signatures on pending proposals.{' '}
            <Link to="/dashboard/admin/governance" className="text-[#195EBC] font-semibold hover:underline">
              Open governance queue
            </Link>
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <AdminGovernanceStatusBadge
            proposalId={pendingProposalId}
            governanceStatus={pendingProposalId ? 'pending_signatures' : 'none'}
          />
        </div>

        {config ? (
          <div className="rounded-[8px] border border-[#E6E8EC] bg-[#FAFBFC] px-4 py-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[14px]">
              <span className="text-[#6B7488]">Multisig</span>
              {multisigExplorerHref ? (
                <a
                  href={multisigExplorerHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[#195EBC] hover:underline"
                >
                  {shortAddress(config.multisigAddress)}
                </a>
              ) : (
                <span className="font-mono text-[#0B1220]">{shortAddress(config.multisigAddress)}</span>
              )}
              <span className="text-[#6B7488]">·</span>
              <span className="text-[#0B1220] font-semibold">
                {config.threshold}-of-{config.signerCount || signers.length}
              </span>
              {config.handoffCompleted ? (
                <span className="inline-flex items-center rounded-full bg-[#DCFCE7] text-[#166534] text-[11px] font-semibold px-2 py-0.5">
                  Handoff complete
                </span>
              ) : null}
            </div>

            <div>
              <p className="text-[#6B7488] text-[12px] font-medium mb-2">Current signers</p>
              <ul className="space-y-1">
                {signers.map((signer) => {
                  const isConnected =
                    connectedAddress && signer.toLowerCase() === connectedAddress.toLowerCase()
                  const href = explorerBase ? blockExplorerAddressUrl(explorerBase, signer) : null
                  return (
                    <li key={signer} className="flex items-center gap-2 font-mono text-[13px]">
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#195EBC] hover:underline">
                          {shortAddress(signer)}
                        </a>
                      ) : (
                        <span>{shortAddress(signer)}</span>
                      )}
                      {isConnected ? (
                        <span className="text-[#16A34A] text-[11px] font-semibold">(connected)</span>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        ) : null}

        {config ? (
          <div className="space-y-5">
            <div>
              <p className="text-[#0B1220] text-[15px] font-semibold mb-3">Rotation wizard</p>
              <div className="space-y-4">
                <div>
                  <p className="text-[#6B7488] text-[13px] font-medium mb-2">Add owner(s)</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <SettingsField
                      id="multisig-add-address"
                      label=""
                      value={addAddressInput}
                      onChange={setAddAddressInput}
                      placeholder="0x…"
                      mono
                    />
                    <button
                      type="button"
                      onClick={handleAddAddressToList}
                      className="h-[44px] shrink-0 rounded-[8px] bg-[#E8EFFB] px-4 text-[#195EBC] text-[14px] font-semibold"
                    >
                      Add to list
                    </button>
                  </div>
                  {addAddresses.length ? (
                    <ul className="mt-2 space-y-1">
                      {addAddresses.map((addr) => (
                        <li key={addr} className="flex items-center justify-between gap-2 font-mono text-[13px]">
                          <span>{shortAddress(addr)}</span>
                          <button
                            type="button"
                            onClick={() => setAddAddresses((prev) => prev.filter((a) => a !== addr))}
                            className="text-[#DC2626] text-[12px] font-semibold hover:underline"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <div>
                  <p className="text-[#6B7488] text-[13px] font-medium mb-2">Remove owner(s)</p>
                  <ul className="space-y-2">
                    {signers.map((signer) => {
                      const checked = removeAddresses.some((a) => a.toLowerCase() === signer.toLowerCase())
                      return (
                        <li key={signer}>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleRemoveSigner(signer)}
                              className="h-4 w-4 rounded border-[#D5DAE2]"
                            />
                            <span className="font-mono text-[13px] text-[#0B1220]">{shortAddress(signer)}</span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                  {removingConnectedWallet ? (
                    <p className="mt-2 text-[#B45309] text-[13px]">
                      Warning: you are removing the connected wallet from the multisig.
                    </p>
                  ) : null}
                </div>

                <SettingsField
                  id="multisig-threshold"
                  label="Threshold"
                  type="number"
                  value={String(draftThreshold)}
                  onChange={(v) => setDraftThreshold(Math.max(1, Number(v) || 1))}
                  hint={`Projected signers after change: ${projectedSignerCount}. Current: ${currentThreshold}-of-${signers.length}.`}
                />
              </div>
            </div>

            <details className="rounded-[8px] border border-[#E6E8EC] bg-[#FAFBFC] px-4 py-3">
              <summary className="cursor-pointer text-[#0B1220] text-[14px] font-semibold">
                Advanced — single-operation proposals
              </summary>
              <div className="mt-4 space-y-3">
                <button
                  type="button"
                  disabled={!addAddresses.length || submitPhase === 'loading'}
                  onClick={() => requestSubmit('add', submitAddOnly)}
                  className="h-10 px-4 rounded-[6px] bg-[#195EBC] text-white text-[13px] font-semibold disabled:opacity-40"
                >
                  Add owners only
                </button>
                <button
                  type="button"
                  disabled={!removeAddresses.length || submitPhase === 'loading'}
                  onClick={() => requestSubmit('remove', submitRemoveOnly)}
                  className="h-10 px-4 rounded-[6px] bg-[#DC2626] text-white text-[13px] font-semibold disabled:opacity-40"
                >
                  Remove owners only
                </button>
                <button
                  type="button"
                  disabled={!thresholdChanged || submitPhase === 'loading'}
                  onClick={() => requestSubmit('threshold', submitThresholdOnly)}
                  className="h-10 px-4 rounded-[6px] bg-[#0B1220] text-white text-[13px] font-semibold disabled:opacity-40"
                >
                  Change threshold only
                </button>
              </div>
            </details>
          </div>
        ) : null}
      </SettingsPanel>
    </>
  )
}

export default MultisigSignersPanel
