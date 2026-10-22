import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'

import DashboardLayout, { type DashboardBreadcrumbItem } from '@/layouts/DashboardLayout'

import cloudUploadIcon from '@/assets/cloud-upload.png'
import documentCheckedIcon from '@/assets/doc-checked.png'
import documentDownloadIcon from '@/assets/doc-download.png'
import documentBinIcon from '@/assets/doc-bin.png'
import { toAppUserFacingError } from '@/errors/toAppUserFacingError'
import { postMerchantLoanRequest } from '@/api/loanRequest'
import { fetchRiskTiers, type RiskTier } from '@/api/riskTiers'
import { useAppSelector } from '@/store/hooks'
import {
  clearMerchantLoanApplyDraft,
  getMerchantLoanApplyDraft,
  saveMerchantLoanApplyDraft,
} from '@/session/merchantLoanApplyDraft'
import {
  calculateLoanTierFigures,
  formatLoanCurrency,
  riskTierSelectLabel,
} from '@/utils/loanTierCalculations'
import FistReceivableAgreementModal from '@/components/dashboard/merchant/loan/FistReceivableAgreementModal'
import { FIST_RECEIVABLE_FINANCING_AGREEMENT_VERSION } from '@/components/dashboard/merchant/loan/fistReceivableFinancingAgreement'

type ApplyLoanLocationState = {
  restoreDraft?: boolean
}

type RiskAcknowledgementKey = 'repaymentTerms' | 'latePaymentPenalties' | 'smartContractEnforcement'

type UploadedDoc = {
  name: string
  size: string
  uploadedAtLabel: string
}

const ACCEPTED_DOCUMENT_EXTENSIONS = ['.pdf', '.doc', '.docx'] as const
const ACCEPTED_DOCUMENT_EXTENSION_SET = new Set<string>(ACCEPTED_DOCUMENT_EXTENSIONS)
const ACCEPTED_DOCUMENT_ACCEPT = ACCEPTED_DOCUMENT_EXTENSIONS.join(',')

/** Maximum upload size per loan document (10 MB). */
const MAX_LOAN_DOCUMENT_BYTES = 10 * 1024 * 1024

function fileExtension(name: string): string {
  const i = name.lastIndexOf('.')
  if (i <= 0) return ''
  return name.slice(i).toLowerCase()
}

function isAcceptedLoanDocument(file: File): boolean {
  return ACCEPTED_DOCUMENT_EXTENSION_SET.has(fileExtension(file.name))
}

/** Returns an error message when the file cannot be uploaded, or `null` if valid. */
function validateLoanDocument(file: File): string | null {
  if (!isAcceptedLoanDocument(file)) {
    return 'Only PDF, DOC, and DOCX files are allowed.'
  }
  if (file.size > MAX_LOAN_DOCUMENT_BYTES) {
    return 'File size must be 10 MB or less.'
  }
  return null
}

function parseLoanAmountInput(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, '')
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isFinite(n) && n > 0 ? n : null
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatUploadedAt(date: Date): string {
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function uploadedDocFromFile(file: File): UploadedDoc {
  return {
    name: file.name,
    size: formatFileSize(file.size),
    uploadedAtLabel: formatUploadedAt(new Date()),
  }
}

const MerchantApplyLoanPage = () => {
  const { poolSlug } = useParams<{ poolSlug: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const sessionChainId = useAppSelector((s) => s.auth.chainId)

  const [amount, setAmount] = useState('')
  const [receiveableName, setReceiveableName] = useState('')
  const [loanInterest, setLoanInterest] = useState('')
  const [repaymentAmount, setRepaymentAmount] = useState('')
  const [riskTierId, setRiskTierId] = useState('')
  const [selectedDocument, setSelectedDocument] = useState<File | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [fileUploadError, setFileUploadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [riskAcknowledgements, setRiskAcknowledgements] = useState<Record<RiskAcknowledgementKey, boolean>>({
    repaymentTerms: false,
    latePaymentPenalties: false,
    smartContractEnforcement: false,
  })
  const [agreementModalOpen, setAgreementModalOpen] = useState(false)
  const [hasReadAgreement, setHasReadAgreement] = useState(false)

  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  /** One request per visit to this page — no refetch on focus, reconnect, or remount while cached. */
  const tiersQuery = useQuery({
    queryKey: ['loan-risk-tiers', sessionChainId],
    queryFn: () => fetchRiskTiers(sessionChainId),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const riskTiers = useMemo(
    () => [...(tiersQuery.data ?? [])].sort((a, b) => a.duration_days - b.duration_days),
    [tiersQuery.data],
  )

  const selectedTier = useMemo(
    () => riskTiers.find((t) => String(t.id) === riskTierId) ?? null,
    [riskTiers, riskTierId],
  )

  const topBarBreadcrumbs: DashboardBreadcrumbItem[] = useMemo(
    () => [
      { label: 'Explore Lending Pools', to: '/dashboard/merchant/overview' },
      { label: 'Lending Pool' },
      { label: 'Apply for Loan' },
    ],
    [],
  )

  useEffect(() => {
    if (!poolSlug) return

    const restore = Boolean((location.state as ApplyLoanLocationState | null)?.restoreDraft)
    if (restore) {
      const saved = getMerchantLoanApplyDraft()
      if (saved && saved.poolSlug === poolSlug) {
        setAmount(saved.amount)
        setReceiveableName(saved.receiveableName)
        setRiskTierId(saved.riskTierId)
        setRiskAcknowledgements(saved.riskAcknowledgements)
        setSelectedDocument(saved.selectedDocument)
        setUploadedDocs(saved.uploadedDocs)
        setFileUploadError(null)
        setSubmitError(null)
      }
      return
    }

    clearMerchantLoanApplyDraft()
  }, [poolSlug, location.state])

  useEffect(() => {
    if (riskTierId || riskTiers.length === 0) return
    const firstActive = riskTiers.find((t) => t.active)
    if (firstActive) setRiskTierId(String(firstActive.id))
  }, [riskTiers, riskTierId])

  useEffect(() => {
    const principal = parseLoanAmountInput(amount)
    if (!principal || !selectedTier) {
      setLoanInterest('')
      setRepaymentAmount('')
      return
    }
    const figures = calculateLoanTierFigures(principal, selectedTier)
    if (!figures) {
      setLoanInterest('')
      setRepaymentAmount('')
      return
    }
    setLoanInterest(formatLoanCurrency(figures.interest))
    setRepaymentAmount(formatLoanCurrency(figures.repayment))
  }, [amount, selectedTier])

  if (!poolSlug) {
    return <Navigate to="/dashboard/merchant/overview" replace />
  }

  const allChecked = Object.values(riskAcknowledgements).every(Boolean)
  const token = accessToken?.trim() ?? ''
  const hasSession = Boolean(token)
  const tiersLoading = tiersQuery.isLoading
  const tiersError = tiersQuery.isError
  const hasActiveTier = riskTiers.some((t) => t.active)
  const hasDocument = Boolean(selectedDocument)

  const resetFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const applySelectedFile = (file: File) => {
    setFileUploadError(null)
    setSelectedDocument(file)
    setUploadedDocs([uploadedDocFromFile(file)])
  }

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    resetFileInput()

    if (!file) return

    const fileError = validateLoanDocument(file)
    if (fileError) {
      setFileUploadError(fileError)
      return
    }

    if (selectedDocument) {
      const replace = window.confirm(
        `You already uploaded "${selectedDocument.name}". Replace it with "${file.name}"?`,
      )
      if (!replace) return
    }

    applySelectedFile(file)
  }

  const removeUploadedDocument = () => {
    setSelectedDocument(null)
    setUploadedDocs([])
    setFileUploadError(null)
    resetFileInput()
  }

  const downloadDocument = () => {
    if (!selectedDocument) return
    const url = URL.createObjectURL(selectedDocument)
    const link = document.createElement('a')
    link.href = url
    link.download = selectedDocument.name
    link.click()
    URL.revokeObjectURL(url)
  }

  const submitLoanRequest = async () => {
    if (submitting) return
    setSubmitError(null)

    if (!hasSession) {
      setSubmitError('Missing session token. Please reconnect your wallet and try again.')
      return
    }

    if (tiersLoading) {
      setSubmitError('Risk tiers are still loading. Please wait a moment.')
      return
    }

    if (tiersError || riskTiers.length === 0) {
      setSubmitError('Could not load risk tiers. Refresh the page and try again.')
      return
    }

    const amountNum = parseLoanAmountInput(amount)
    if (amountNum == null) {
      setSubmitError('Enter a valid loan amount greater than 0.')
      return
    }

    if (!selectedTier) {
      setSubmitError('Select a risk tier duration.')
      return
    }

    if (!selectedTier.active) {
      setSubmitError('The selected risk tier is not available. Choose an active tier.')
      return
    }

    if (!selectedDocument) {
      setSubmitError('Please upload your document (PDF, DOC, or DOCX only).')
      return
    }

    const documentError = validateLoanDocument(selectedDocument)
    if (documentError) {
      setSubmitError(documentError)
      return
    }

    if (!hasReadAgreement) {
      setSubmitError('Please read and confirm the Fist Receivable Financing Agreement before submitting.')
      return
    }

    if (!allChecked) {
      setSubmitError('Please complete all required acknowledgements to continue.')
      return
    }

    const form = new FormData()
    form.append('loan_amount', String(amountNum))
    form.append('risk_tier_id', String(selectedTier.id))
    form.append('document', selectedDocument)
    form.append('agreement_version', FIST_RECEIVABLE_FINANCING_AGREEMENT_VERSION)
    form.append('financing_amount', String(amountNum))
    if (repaymentAmount.trim()) {
      const repayNum = parseLoanAmountInput(repaymentAmount)
      if (repayNum != null) form.append('repayment_amount', String(repayNum))
    }
    if (loanInterest.trim()) {
      const chargesNum = parseLoanAmountInput(loanInterest)
      if (chargesNum != null) form.append('charges', String(chargesNum))
    }
    form.append('signature', 'wallet-ack')

    setSubmitting(true)
    try {
      const res = await postMerchantLoanRequest(token, form)
      const requestId = res.request_id?.trim()
      if (!requestId) {
        throw new Error('Loan was submitted but no request id was returned. Please check your receivables list.')
      }
      clearMerchantLoanApplyDraft()
      navigate(`/dashboard/merchant/receivables/${encodeURIComponent(requestId)}`, {
        replace: true,
        state: { poolSlug },
      })
    } catch (e) {
      const message = toAppUserFacingError(e, {
        fallback: 'We could not submit your loan request. Please try again.',
        context: 'general',
      })

      saveMerchantLoanApplyDraft({
        poolSlug,
        amount,
        receiveableName,
        riskTierId,
        riskAcknowledgements,
        selectedDocument,
        uploadedDocs,
      })

      navigate(`/dashboard/merchant/lending-pool/${poolSlug}/apply-loan/failure`, {
        replace: true,
        state: {
          message: message.trim() || 'We could not submit your loan request. Please try again.',
        },
      })
    } finally {
      setSubmitting(false)
    }
  }

  const renderRiskTierSelect = () => {
    if (tiersLoading) {
      return (
        <select
          disabled
          className="mt-2 w-full border border-[#E6E8EC] rounded-[6px] px-4 py-2.5 text-[14px] bg-[#F9FAFB] text-[#8B92A3] cursor-wait"
        >
          <option>Loading risk tiers…</option>
        </select>
      )
    }

    if (tiersError || riskTiers.length === 0) {
      return (
        <select
          disabled
          className="mt-2 w-full border border-[#FECACA] rounded-[6px] px-4 py-2.5 text-[14px] bg-[#FEF2F2] text-[#B91C1C] cursor-not-allowed"
        >
          <option>Risk tiers unavailable</option>
        </select>
      )
    }

    return (
      <select
        value={riskTierId}
        onChange={(e) => setRiskTierId(e.target.value)}
        className="mt-2 w-full border border-[#E6E8EC] rounded-[6px] px-4 py-2.5 text-[14px] outline-none focus:border-[#195EBC] disabled:bg-[#F9FAFB] disabled:text-[#8B92A3] disabled:cursor-not-allowed"
        disabled={!hasActiveTier}
      >
        {!riskTierId ? <option value="">Select duration</option> : null}
        {riskTiers.map((tier: RiskTier) => (
          <option
            key={tier.id}
            value={String(tier.id)}
            disabled={!tier.active}
            className={tier.active ? '' : 'text-[#8B92A3]'}
          >
            {riskTierSelectLabel(tier)}
          </option>
        ))}
      </select>
    )
  }

  return (
    <DashboardLayout
      dashboardBasePath="/dashboard/merchant"
      topBarBreadcrumbs={topBarBreadcrumbs}
      topBarWalletDisplay="0x7A3F...92C1"
    >
      <div className="max-w-[860px] w-full mx-auto pt-4 sm:pt-6 lg:pt-8 pb-6 flex flex-col gap-4 sm:gap-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-[#6B7488] text-[13px] inline-flex items-center gap-2 hover:text-[#195EBC]"
          >
            <span aria-hidden>←</span>
            Back
          </button>
        </div>

        <div className="pt-1">
          <h1 className="text-[#0B1220] font-bold text-[18px] sm:text-[20px] leading-tight">Loan Configuration</h1>
        </div>

        <section className="rounded-[10px] border border-[#DFE2E8] bg-white p-4 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            <label className="block">
              <span className="text-[#6B7488] text-[12px]">Loan Amount</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter an Amount"
                className="mt-2 w-full border border-[#E6E8EC] rounded-[6px] px-4 py-2.5 text-[14px] outline-none focus:border-[#195EBC]"
              />
            </label>

            <label className="block">
              <span className="text-[#6B7488] text-[12px]">Risk Tier Duration</span>
              {renderRiskTierSelect()}
              {selectedTier && !selectedTier.active ? (
                <p className="mt-1.5 text-[#B45309] text-[12px]" role="status">
                  This tier is inactive and cannot be used for new loans.
                </p>
              ) : null}
            </label>

            <label className="block">
              <span className="text-[#6B7488] text-[12px]">Receivable Name</span>
              <input
                value={receiveableName}
                onChange={(e) => setReceiveableName(e.target.value)}
                placeholder="Name Your Receivable"
                className="mt-2 w-full border border-[#E6E8EC] rounded-[6px] px-4 py-2.5 text-[14px] outline-none focus:border-[#195EBC]"
              />
            </label>

            <div className="hidden md:block" aria-hidden />

            <label className="block">
              <span className="text-[#6B7488] text-[12px]">Loan Interest</span>
              <input
                value={loanInterest}
                readOnly
                placeholder={amount.trim() && selectedTier ? 'Calculating…' : 'Enter amount and tier'}
                className="mt-2 w-full border border-[#E6E8EC] rounded-[6px] px-4 py-2.5 text-[14px] bg-[#FAFBFD] text-[#0B1220] cursor-default"
                aria-readonly="true"
              />
              {selectedTier ? (
                <p className="mt-1 text-[#8B92A3] text-[11px]">
                  {selectedTier.interest_percent}% flat for {selectedTier.duration_days}-day tenor
                </p>
              ) : null}
            </label>

            <label className="block">
              <span className="text-[#6B7488] text-[12px]">Repayment Amount</span>
              <input
                value={repaymentAmount}
                readOnly
                placeholder={amount.trim() && selectedTier ? 'Calculating…' : 'Enter amount and tier'}
                className="mt-2 w-full border border-[#E6E8EC] rounded-[6px] px-4 py-2.5 text-[14px] bg-[#FAFBFD] text-[#0B1220] cursor-default"
                aria-readonly="true"
              />
            </label>
          </div>
        </section>

        <section className="rounded-[10px] border border-[#DFE2E8] bg-white p-4 sm:p-6">
          <h2 className="text-[#6B7488] text-[14px] font-semibold">
            Files Upload <span className="text-[#B91C1C]">*</span>
          </h2>
          <p className="text-[#8B92A3] text-[12px] mt-2">
            Upload one document (required): Invoice/Receivable Proof, Supporting Contract &amp; Agreement, Purchase
            Order, or Monthly Revenue.
          </p>

          <div className="mt-4 rounded-[8px] border border-dashed border-[#D5DAE2] bg-[#FAFBFD] p-5 sm:p-8 text-center">
            <div className="mx-auto h-[44px] w-[44px] rounded-full bg-white flex items-center justify-center border border-[#E6E8EC]">
              <img src={cloudUploadIcon} alt="upload file" className="h-[22px] w-[22px] object-contain" draggable={false} />
            </div>

            <div className="mt-3 text-[#6B7488] text-[14px] font-medium">Click to upload or drag and drop</div>
            <div className="mt-2 text-[#8B92A3] text-[11px]">PDF, DOC, or DOCX only — max 10 MB</div>

            <div className="mt-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#EDF0F4]" />
              <div className="text-[#8B92A3] text-[11px] font-medium">OR</div>
              <div className="h-px flex-1 bg-[#EDF0F4]" />
            </div>

            <label className="mt-4 inline-flex items-center justify-center px-6 py-2.5 bg-[#195EBC] text-white text-[14px] rounded-[6px] font-medium cursor-pointer">
              {hasDocument ? 'Replace file' : 'Browse Files'}
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_DOCUMENT_ACCEPT}
                className="hidden"
                onChange={handleFileInputChange}
              />
            </label>
          </div>

          {fileUploadError ? (
            <p className="mt-3 text-[#B91C1C] text-[12px] text-center" role="alert">
              {fileUploadError}
            </p>
          ) : !hasDocument ? (
            <p className="mt-3 text-[#8B92A3] text-[12px] text-center" role="status">
              No file uploaded yet. A document is required to submit your application.
            </p>
          ) : null}

          <div className="mt-5 flex flex-col gap-3">
            {uploadedDocs.map((doc) => (
              <div key={doc.name} className="flex items-center justify-between border border-[#EDF0F4] rounded-[6px] px-4 py-3 bg-white">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-7 w-7 rounded-full bg-white flex items-center justify-center" aria-hidden>
                    <img src={documentCheckedIcon} alt="" className="h-7 w-7 object-contain" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[#0B1220] text-[12px] font-semibold truncate">{doc.name}</p>
                    <p className="text-[#8B92A3] text-[11px] mt-0.5">
                      Uploaded: {doc.uploadedAtLabel} • {doc.size}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <button
                    type="button"
                    className="h-5 w-5 flex items-center justify-center"
                    aria-label={`Download ${doc.name}`}
                    onClick={() => downloadDocument()}
                  >
                    <img src={documentDownloadIcon} alt="" className="h-5 w-5 object-contain" />
                  </button>
                  <button
                    type="button"
                    className="h-5 w-5 flex items-center justify-center"
                    aria-label={`Remove ${doc.name}`}
                    onClick={removeUploadedDocument}
                  >
                    <img src={documentBinIcon} alt="" className="h-5 w-5 object-contain" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[10px] border border-[#DFE2E8] bg-white p-4 sm:p-6">
          <h2 className="text-[#6B7488] text-[14px] font-semibold">Required Acknowledgements</h2>
          <p className="mt-3 text-[#0B1220] text-[13px] leading-relaxed">
            By selecting the acknowledgements, signing with the connected wallet and submitting this
            application, I confirm that I am authorized to bind the Merchant, that the submitted
            invoice information is accurate, and that the Merchant accepts the Fist Receivable
            Financing Agreement and Transaction Schedule for this receivable.
          </p>

          <button
            type="button"
            onClick={() => setAgreementModalOpen(true)}
            className="mt-4 text-[#195EBC] text-[13px] font-semibold hover:underline text-left"
          >
            View Fist Receivable Financing Agreement
            {hasReadAgreement ? (
              <span className="ml-2 text-[#16A34A] font-medium no-underline">(read)</span>
            ) : null}
          </button>

          <div className="mt-4 flex flex-col gap-3">
            <label className="flex items-start gap-3 border border-[#EDF0F4] rounded-[6px] px-4 py-3">
              <input
                type="checkbox"
                className="mt-0.5 shrink-0"
                checked={riskAcknowledgements.repaymentTerms}
                onChange={(e) => setRiskAcknowledgements((prev) => ({ ...prev, repaymentTerms: e.target.checked }))}
              />
              <span className="text-[#0B1220] text-[13px] leading-relaxed">
                I have reviewed and accept the repayment amount, due date, fees and recourse terms for
                this receivable.
              </span>
            </label>

            <label className="flex items-start gap-3 border border-[#EDF0F4] rounded-[6px] px-4 py-3">
              <input
                type="checkbox"
                className="mt-0.5 shrink-0"
                checked={riskAcknowledgements.latePaymentPenalties}
                onChange={(e) =>
                  setRiskAcknowledgements((prev) => ({ ...prev, latePaymentPenalties: e.target.checked }))
                }
              />
              <span className="text-[#0B1220] text-[13px] leading-relaxed">
                I have reviewed and accept the stated late-payment charges and default consequences.
              </span>
            </label>

            <label className="flex items-start gap-3 border border-[#EDF0F4] rounded-[6px] px-4 py-3">
              <input
                type="checkbox"
                className="mt-0.5 shrink-0"
                checked={riskAcknowledgements.smartContractEnforcement}
                onChange={(e) =>
                  setRiskAcknowledgements((prev) => ({ ...prev, smartContractEnforcement: e.target.checked }))
                }
              />
              <span className="text-[#0B1220] text-[13px] leading-relaxed">
                I authorize Fist&apos;s smart contracts to process the approved verification, funding,
                payout, repayment and distribution instructions for this receivable.
              </span>
            </label>
          </div>

          <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 pb-4 sm:pb-6 pt-4 bg-white border-t border-[#EDF0F4] lg:static lg:border-t-0 lg:px-0 lg:pb-0 lg:pt-6 lg:mx-0">
            {submitError ? (
              <p className="mb-3 text-[#B91C1C] text-[13px]" role="alert">
                {submitError}
              </p>
            ) : null}
            <button
              type="button"
              disabled={
                !allChecked ||
                !hasSession ||
                !hasDocument ||
                submitting ||
                tiersLoading ||
                tiersError ||
                !hasActiveTier ||
                !selectedTier?.active
              }
              className={`w-full rounded-[6px] bg-[#1B66CF] text-white text-[15px] sm:text-[16px] font-semibold py-3 transition-colors ${
                allChecked &&
                hasSession &&
                hasDocument &&
                !submitting &&
                !tiersLoading &&
                !tiersError &&
                hasActiveTier &&
                selectedTier?.active
                  ? 'opacity-100 hover:bg-[#154a9a]'
                  : 'opacity-60 cursor-not-allowed'
              }`}
              onClick={() => void submitLoanRequest()}
            >
              {submitting ? 'Submitting…' : 'Submit Receivable Funding Application →'}
            </button>
          </div>
        </section>
      </div>

      <FistReceivableAgreementModal
        open={agreementModalOpen}
        onClose={() => setAgreementModalOpen(false)}
        onConfirmRead={() => {
          setHasReadAgreement(true)
          setAgreementModalOpen(false)
        }}
      />
    </DashboardLayout>
  )
}

export default MerchantApplyLoanPage
