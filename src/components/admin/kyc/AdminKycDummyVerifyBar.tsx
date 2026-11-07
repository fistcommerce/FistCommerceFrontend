import { useCallback, useRef, useState } from 'react'

import { toUserFacingError } from '@/api/client'
import { postAdminKycDummyVerify, type KycReviewUserType } from '@/api/adminKycReview'
import { submitAdminAction } from '@/admin/governance/submitAdminAction'
import {
  PrivilegedActionFeedbackLayer,
  type PrivilegedActionPhase,
} from '@/admin/governance/PrivilegedActionFeedbackLayer'
import type { ResolvedGovernanceOutcome } from '@/admin/governance/types'
import { AdminPanel, AdminStatusPill } from '@/components/admin/primitives'
import { useAppSelector } from '@/store/hooks'
import { isAbortError } from '@/utils/abortError'

type AdminKycDummyVerifyBarProps = {
  wallet: string
  userType: KycReviewUserType
  reviewed?: boolean
  onReviewComplete: () => void
}

export function AdminKycDummyVerifyBar({
  wallet,
  userType,
  reviewed = false,
  onReviewComplete,
}: AdminKycDummyVerifyBarProps) {
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const abortRef = useRef<AbortController | null>(null)
  const [phase, setPhase] = useState<PrivilegedActionPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<ResolvedGovernanceOutcome | null>(null)

  const canRun = !reviewed

  const resetFeedback = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setPhase('idle')
    setError(null)
    setOutcome(null)
  }, [])

  const runDummyVerify = useCallback(async () => {
    if (!canRun || phase === 'loading') return
    const token = accessToken?.trim()
    if (!token) {
      setError('Missing admin session.')
      setPhase('failed')
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('loading')
    setError(null)
    setOutcome(null)

    try {
      const resolved = await submitAdminAction(
        () =>
          postAdminKycDummyVerify(
            token,
            { username: wallet, userType },
            { signal: controller.signal },
          ),
        { operationType: 'kyc_status' },
      )
      if (controller.signal.aborted) return
      setOutcome(resolved)
      setPhase('succeeded')
      onReviewComplete()
    } catch (e) {
      if (isAbortError(e) || controller.signal.aborted) {
        setPhase('idle')
        return
      }
      setError(toUserFacingError(e, 'Could not run dummy KYC verification.'))
      setPhase('failed')
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
      }
    }
  }, [accessToken, canRun, onReviewComplete, phase, userType, wallet])

  const roleLabel = userType === 'merchant' ? 'merchant' : 'investor'

  return (
    <>
      <PrivilegedActionFeedbackLayer
        phase={phase}
        resolvedOutcome={outcome}
        loadingTitle="Running dummy KYC verification"
        loadingDescription="Minting the verification NFT and forcing the record to Verified…"
        errorTitle="Unable to run dummy verification"
        errorDescription={error ?? undefined}
        directSuccessTitle="Dummy KYC verification completed"
        onDismiss={resetFeedback}
        onRetry={() => void runDummyVerify()}
        onCancelLoading={resetFeedback}
      />

      <AdminPanel className="border-[#F0C36D] bg-[#FFFBEF] px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
              <span className="text-[#92400E] text-[13px] font-semibold">
                Dummy KYC verification (dev / QA)
              </span>
              <AdminStatusPill variant="underReview">Bypasses Didit</AdminStatusPill>
            </div>
            {canRun ? (
              <button
                type="button"
                disabled={phase === 'loading'}
                onClick={() => void runDummyVerify()}
                className="h-10 px-5 rounded-[6px] bg-[#B45309] text-white text-[14px] font-semibold hover:bg-[#92400E] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Dummy verify (bypass KYC)
              </button>
            ) : (
              <span className="text-[#6B7488] text-[13px]">KYC record already reviewed.</span>
            )}
          </div>

          <div className="rounded-[8px] border border-[#F0C36D] bg-white/60 px-4 py-3">
            <p className="text-[#92400E] text-[13px] font-semibold">
              What this does — use only in development / testing
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[#6B5A2E] text-[12px] leading-relaxed">
              <li>
                Skips the real Didit identity check entirely — <strong>no actual KYC/KYB is
                performed</strong>.
              </li>
              <li>
                Mints a real {roleLabel} verification NFT on-chain and creates the compliance
                record for this wallet.
              </li>
              <li>
                Sets <strong>kyc_verified</strong>
                {userType === 'merchant' ? ' and insurance_verified' : ''} and forces the record to{' '}
                <strong>Verified</strong>.
              </li>
              <li>
                Creates the KYC record if the user never submitted one, and marks it reviewed —
                this cannot be undone from here.
              </li>
              <li>
                Completes immediately (including Stellar investor allowlist on-chain). Normal
                admin KYC review may still queue a multisig proposal after handoff.
              </li>
            </ul>
          </div>
        </div>
      </AdminPanel>
    </>
  )
}
