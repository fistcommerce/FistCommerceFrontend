import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'

import { fetchInvoiceDownload, fetchReceivableEvidence, type ReceivableEvidenceBundle } from '@/api/evidence'
import { toUserFacingError } from '@/api/client'
import { FistCommerceLogo } from '@/components/landing/FistCommerceLogo'
import {
  FIST_RECEIVABLE_FINANCING_AGREEMENT_BLOCKS,
  FIST_RECEIVABLE_FINANCING_AGREEMENT_VERSION,
} from '@/components/dashboard/merchant/loan/fistReceivableFinancingAgreement'
import { useAppSelector } from '@/store/hooks'

function DocumentFrame({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-[#F8FAFC] px-4 py-8">
      <div className="mx-auto flex max-w-[760px] flex-col gap-6">
        <FistCommerceLogo variant="onLight" />
        <div className="rounded-[12px] border border-[#E6E8EC] bg-white p-5 sm:p-8">
          <h1 className="text-[22px] font-semibold text-[#0B1220]">{title}</h1>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </div>
  )
}

function useReceivableDocument() {
  const { loanId = '' } = useParams()
  const accessToken = useAppSelector((s) => s.auth.accessToken) || ''
  const [bundle, setBundle] = useState<ReceivableEvidenceBundle | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!accessToken.trim() || !loanId) return
    let cancelled = false
    fetchReceivableEvidence(accessToken, loanId)
      .then((data) => {
        if (!cancelled) setBundle(data)
      })
      .catch((e) => {
        if (!cancelled) setError(toUserFacingError(e, 'Unable to open this receivable'))
      })
    return () => {
      cancelled = true
    }
  }, [accessToken, loanId])

  return { loanId, accessToken, bundle, error }
}

export function ReceivableInvoicePage() {
  const { loanId, accessToken, bundle, error } = useReceivableDocument()
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const documentUrl = bundle?.invoice?.documentUrl?.trim() || ''

  useEffect(() => {
    if (!accessToken.trim() || !loanId || !documentUrl) return
    let cancelled = false
    fetchInvoiceDownload(accessToken, loanId)
      .then((data) => {
        if (!cancelled) setDownloadUrl(data.downloadUrl)
      })
      .catch((e) => {
        if (!cancelled) setDownloadError(toUserFacingError(e, 'Unable to open the invoice file'))
      })
    return () => {
      cancelled = true
    }
  }, [accessToken, loanId, documentUrl])

  if (!accessToken.trim()) return <Navigate to="/continue" replace />

  const hash = bundle?.invoice?.invoiceReference || ''

  return (
    <DocumentFrame title="Invoice">
      {error ? <p className="text-[14px] text-[#9B2C2C]">{error}</p> : null}
      {!bundle && !error ? <p className="text-[14px] text-[#6B7488]">Loading the invoice…</p> : null}
      {bundle && !documentUrl ? (
        <div className="space-y-3 text-[14px] leading-relaxed text-[#0B1220]">
          <p>This receivable does not include a link to the invoice file.</p>
          <p className="text-[#4D5D80]">
            File links are included for receivables created after October 2026.
          </p>
          {hash ? (
            <p className="break-all font-mono text-[12px] text-[#0B1220]">Document hash {hash}</p>
          ) : (
            <p className="text-[#6B7488]">No document hash is on file.</p>
          )}
        </div>
      ) : null}
      {bundle && documentUrl ? (
        <div className="space-y-3 text-[14px] leading-relaxed text-[#0B1220]">
          <p>{bundle.loanName || 'Receivable'} invoice file.</p>
          {hash ? <p className="break-all font-mono text-[12px]">{hash}</p> : null}
          {downloadError ? <p className="text-[#9B2C2C]">{downloadError}</p> : null}
          {downloadUrl ? (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center rounded-[8px] bg-[#195EBC] px-4 text-[14px] font-semibold text-white"
            >
              Open invoice file
            </a>
          ) : downloadError ? null : (
            <p className="text-[#6B7488]">Preparing the file…</p>
          )}
        </div>
      ) : null}
      <p className="mt-6">
        <Link to="/continue" className="text-[13px] font-semibold text-[#195EBC]">
          Back to Fist Commerce
        </Link>
      </p>
    </DocumentFrame>
  )
}

export function ReceivableAgreementPage() {
  const { accessToken, bundle, error } = useReceivableDocument()
  if (!accessToken.trim()) return <Navigate to="/continue" replace />

  const agreement = bundle?.agreement as Record<string, string | null> | null
  const version = (agreement?.agreementVersion || '').replace(/^v/i, '')
  const knownText = version === FIST_RECEIVABLE_FINANCING_AGREEMENT_VERSION

  return (
    <DocumentFrame title="Financing agreement">
      {error ? <p className="text-[14px] text-[#9B2C2C]">{error}</p> : null}
      {!bundle && !error ? <p className="text-[14px] text-[#6B7488]">Loading the agreement…</p> : null}
      {bundle && !agreement ? (
        <p className="text-[14px] text-[#6B7488]">No financing agreement is on file for this receivable.</p>
      ) : null}
      {agreement ? (
        <div className="space-y-2 text-[14px] text-[#0B1220]">
          <p className="font-semibold">{agreement.agreementFilename || 'Financing agreement'}</p>
          <p>Version {version || 'not recorded'}</p>
          {agreement.repaymentAmount ? <p>Amount to repay {agreement.repaymentAmount}</p> : null}
          {agreement.financingAmount ? <p>Amount financed {agreement.financingAmount}</p> : null}
          {agreement.dueDate ? <p>Due {agreement.dueDate}</p> : null}
          {agreement.acceptedAt ? <p>Accepted {agreement.acceptedAt}</p> : null}
          {knownText ? (
            <div className="mt-4 space-y-2 border-t border-[#E6E8EC] pt-4">
              {FIST_RECEIVABLE_FINANCING_AGREEMENT_BLOCKS.map((block, index) => {
                if (block.type === 'bullet') {
                  return (
                    <p key={index} className="pl-4 text-[13px] leading-relaxed text-[#334155]">
                      • {block.text}
                    </p>
                  )
                }
                if (block.type === 'docTitle' || block.type === 'sectionHeading') {
                  return (
                    <h2 key={index} className="pt-3 text-[15px] font-semibold text-[#0B1220]">
                      {block.text}
                    </h2>
                  )
                }
                return (
                  <p key={index} className="text-[13px] leading-relaxed text-[#334155]">
                    {'label' in block ? `${block.label}: ` : ''}
                    {block.text}
                  </p>
                )
              })}
            </div>
          ) : (
            <p className="pt-2 text-[13px] leading-relaxed text-[#6B7488]">
              The full wording for version {version || 'this acceptance'} is not in this build. The acceptance
              details above are the record stored for this receivable.
            </p>
          )}
        </div>
      ) : null}
      <p className="mt-6">
        <Link to="/continue" className="text-[13px] font-semibold text-[#195EBC]">
          Back to Fist Commerce
        </Link>
      </p>
    </DocumentFrame>
  )
}
