import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { fetchInvestorPoolDocuments, fetchMerchantDocuments, fetchEvidenceRegister, downloadPoolDocumentsExport, type ReceivableEvidenceBundle } from '@/api/evidence'
import { toUserFacingError } from '@/api/client'
import primeChevronRight from '@/assets/prime_chevron-right.png'
import docChecked from '@/assets/doc-checked.png'
import EvidenceBundlePanel from '@/components/evidence/EvidenceBundlePanel'
import { ListPagination } from '@/components/shared/ListPagination'
import { AsyncTableBodyMessage } from '@/components/dashboard/shared/asyncDataTableBody'
import { DashboardRequestFeedbackLayer } from '@/components/dashboard/shared/DashboardRequestFeedbackLayer'
import { usePaginatedListItems } from '@/hooks/usePaginatedListItems'
import { useAppSelector } from '@/store/hooks'
import { saveBlobAsFile, type SaveBlobResult } from '@/utils/saveBlobAsFile'

type ReadyExport = {
  blob: Blob
  filename: string
  csvText: string | null
}

const DESKTOP_COLUMNS = 7
const DEFAULT_POOL_PATH = '/dashboard/investor/lending-pool/fist-commerce-lending-pool'

function merchantLabel(bundle: ReceivableEvidenceBundle): string {
  const m = bundle.merchant as Record<string, string | null> | null
  return m?.businessName || m?.fullName || '—'
}

function merchantWallet(bundle: ReceivableEvidenceBundle): string {
  return (bundle.merchantWallet || '').trim()
}

function verificationLabel(bundle: ReceivableEvidenceBundle): string {
  return bundle.verification?.evidence || bundle.verification?.status || 'Not verified'
}

function shortId(value: string | null | undefined): string {
  const raw = (value || '').trim()
  if (!raw) return '—'
  if (raw.length <= 13) return raw
  return `${raw.slice(0, 6)}…${raw.slice(-4)}`
}

function compactAmount(value: string | null | undefined): string {
  if (value == null || value === '') return '—'
  const amount = Number(value)
  if (!Number.isFinite(amount)) return value
  const sign = amount < 0 ? '-' : ''
  const abs = Math.abs(amount)
  const scaled = (divisor: number, suffix: string) => {
    const num = abs / divisor
    const rounded = num >= 100 ? Math.round(num) : Math.round(num * 10) / 10
    const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
    return `${sign}$${text}${suffix}`
  }
  if (abs >= 1_000_000_000) return scaled(1_000_000_000, 'b')
  if (abs >= 1_000_000) return scaled(1_000_000, 'm')
  if (abs >= 1_000) return scaled(1_000, 'k')
  const whole = Math.round(abs)
  return `${sign}$${whole}`
}

function formatAge(value: string | null | undefined): string {
  if (!value) return '—'
  const then = Date.parse(value)
  if (!Number.isFinite(then)) return '—'
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}D`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}M`
  return `${Math.floor(days / 365)}Y`
}

function updatedTime(bundle: ReceivableEvidenceBundle): number {
  const parsed = bundle.updatedAt ? Date.parse(bundle.updatedAt) : NaN
  return Number.isFinite(parsed) ? parsed : 0
}

function receivableTitle(bundle: ReceivableEvidenceBundle): string {
  return bundle.loanName || shortId(bundle.receivableId) || shortId(bundle.loanId)
}

function formatAppliedPeriod(range: { from?: string; to?: string }): string | null {
  const pretty = (iso: string) => {
    const [year, month, day] = iso.split('-').map(Number)
    if (!year || !month || !day) return iso
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })
  }
  if (range.from && range.to) {
    return `Showing receivables from ${pretty(range.from)} to ${pretty(range.to)}.`
  }
  if (range.from) return `Showing receivables from ${pretty(range.from)}.`
  if (range.to) return `Showing receivables through ${pretty(range.to)}.`
  return null
}

function lockDashboardScroll(target: HTMLElement): (() => void) | null {
  const scroller = target.closest('[data-dashboard-scroll]')
  if (!(scroller instanceof HTMLElement)) return null
  const previous = scroller.style.overflow
  scroller.style.overflow = 'clip'
  return () => {
    scroller.style.overflow = previous
  }
}

function PoolDocumentRangeControls({
  periodLabel,
  fromDate,
  toDate,
  exporting,
  exportDisabled,
  exportNotice,
  shareTextReady,
  onFromDate,
  onToDate,
  onApply,
  onExport,
  onShareText,
}: {
  periodLabel: string | null
  fromDate: string
  toDate: string
  exporting: string | null
  exportDisabled: boolean
  exportNotice: string | null
  shareTextReady: boolean
  onFromDate: (value: string) => void
  onToDate: (value: string) => void
  onApply: () => void
  onExport: (fmt: 'csv' | 'xlsx' | 'pdf') => void
  onShareText: () => void
}) {
  const releaseRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      releaseRef.current?.()
    }
  }, [])

  const lockScroll = (target: HTMLInputElement) => {
    if (releaseRef.current) return
    releaseRef.current = lockDashboardScroll(target)
  }

  const releaseScroll = (next?: EventTarget | null) => {
    if (next instanceof HTMLInputElement && next.dataset.poolDate === 'true') return
    releaseRef.current?.()
    releaseRef.current = null
  }

  return (
    <div className="flex flex-col gap-2">
      {periodLabel ? <p className="text-[13px] text-[#4D5D80]">{periodLabel}</p> : null}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[12px] text-[#6B7488]">
          From
          <input
            type="date"
            data-pool-date="true"
            value={fromDate}
            onChange={(e) => {
              onFromDate(e.target.value)
              releaseScroll()
            }}
            onPointerDown={(e) => lockScroll(e.currentTarget)}
            onTouchStart={(e) => lockScroll(e.currentTarget)}
            onBlur={(e) => releaseScroll(e.relatedTarget)}
            className="h-9 rounded-[6px] border border-[#D5DAE2] px-2 text-base text-[#0B1220]"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-[#6B7488]">
          To
          <input
            type="date"
            data-pool-date="true"
            value={toDate}
            onChange={(e) => {
              onToDate(e.target.value)
              releaseScroll()
            }}
            onPointerDown={(e) => lockScroll(e.currentTarget)}
            onTouchStart={(e) => lockScroll(e.currentTarget)}
            onBlur={(e) => releaseScroll(e.relatedTarget)}
            className="h-9 rounded-[6px] border border-[#D5DAE2] px-2 text-base text-[#0B1220]"
          />
        </label>
        <button
          type="button"
          onClick={onApply}
          className="h-9 px-3 rounded-[6px] border border-[#E6E8EC] bg-white text-[#0B1220] text-[13px] font-semibold"
        >
          Apply
        </button>
        {(['csv', 'xlsx', 'pdf'] as const).map((fmt) => (
          <button
            key={fmt}
            type="button"
            disabled={exportDisabled || !!exporting}
            onClick={() => onExport(fmt)}
            className="h-9 px-3 rounded-[6px] bg-[#195EBC] text-white text-[13px] font-semibold disabled:opacity-60"
          >
            {exporting === fmt ? 'Exporting…' : fmt.toUpperCase()}
          </button>
        ))}
        {shareTextReady ? (
          <button
            type="button"
            onClick={onShareText}
            className="h-9 px-3 rounded-[6px] border border-[#0B1220] bg-white text-[#0B1220] text-[13px] font-semibold"
          >
            Share text
          </button>
        ) : null}
      </div>
      {exportNotice ? (
        <p className="text-[13px] text-[#0B1220] leading-relaxed" role="status">
          {exportNotice}
        </p>
      ) : null}
    </div>
  )
}

function matchesSearch(bundle: ReceivableEvidenceBundle, q: string): boolean {
  if (!q) return true
  const hay = [
    bundle.loanName,
    bundle.loanId,
    bundle.receivableId,
    merchantLabel(bundle),
    merchantWallet(bundle),
    bundle.invoice?.invoiceReference,
    verificationLabel(bundle),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return hay.includes(q)
}

export default function InvestorPoolDocumentsContent({
  audience = 'investor',
}: {
  audience?: 'investor' | 'merchant' | 'admin'
}) {
  const accessToken = useAppSelector((s) => s.auth.accessToken) || ''
  const [docs, setDocs] = useState<ReceivableEvidenceBundle[]>([])
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<'idle' | 'loading' | 'failed'>('loading')
  const [searchTerm, setSearchTerm] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [appliedRange, setAppliedRange] = useState<{ from?: string; to?: string }>({})
  const [exporting, setExporting] = useState<string | null>(null)
  const [exportNotice, setExportNotice] = useState<string | null>(null)
  const [readyExport, setReadyExport] = useState<ReadyExport | null>(null)
  const [filePreview, setFilePreview] = useState<{ url: string; filename: string; csvText: string | null } | null>(null)
  const filePreviewRef = useRef<string | null>(null)
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null)
  const title = audience === 'merchant' ? 'Documents' : 'Pool documents'

  const load = useCallback(() => {
    if (!accessToken.trim()) return
    setPhase('loading')
    setError(null)
    const request =
      audience === 'admin'
        ? fetchEvidenceRegister(accessToken, appliedRange).then((data) => ({
            documents: data.documents || [],
          }))
        : audience === 'merchant'
          ? fetchMerchantDocuments(accessToken, appliedRange)
          : fetchInvestorPoolDocuments(accessToken, appliedRange)
    request
      .then((data) => {
        setDocs(data.documents || [])
        setPhase('idle')
      })
      .catch((e) => {
        setError(toUserFacingError(e, `Failed to load ${title.toLowerCase()}`))
        setPhase('failed')
      })
  }, [accessToken, appliedRange, audience, title])

  useEffect(() => {
    load()
  }, [load])

  const ordered = useMemo(() => {
    return [...docs].sort(
      (a, b) => updatedTime(b) - updatedTime(a) || a.loanId.localeCompare(b.loanId),
    )
  }, [docs])

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return ordered.filter((d) => matchesSearch(d, q))
  }, [ordered, searchTerm])

  const { pageItems, meta, setPage } = usePaginatedListItems(filtered, [searchTerm, appliedRange], 10)

  useEffect(() => {
    if (selectedLoanId && !pageItems.some((d) => d.loanId === selectedLoanId)) {
      setSelectedLoanId(null)
    }
  }, [pageItems, selectedLoanId])

  useEffect(() => {
    if (!selectedLoanId) return
    const loanId = selectedLoanId
    const frame = requestAnimationFrame(() => {
      const panels = document.querySelectorAll<HTMLElement>(
        `[data-pool-detail="${CSS.escape(loanId)}"]`,
      )
      const visible = [...panels].find((panel) => panel.getClientRects().length > 0)
      visible?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => cancelAnimationFrame(frame)
  }, [selectedLoanId])

  const feedbackPhase = phase === 'loading' || phase === 'failed' ? phase : 'idle'
  const showTable = phase !== 'loading'

  const applyRange = () => {
    if (fromDate && toDate && fromDate > toDate) {
      setError('The start date must be on or before the end date.')
      setPhase('failed')
      return
    }
    setAppliedRange({
      from: fromDate || undefined,
      to: toDate || undefined,
    })
  }

  const clearFilePreview = () => {
    if (filePreviewRef.current) URL.revokeObjectURL(filePreviewRef.current)
    filePreviewRef.current = null
    setFilePreview(null)
  }

  useEffect(() => clearFilePreview, [])

  const showFilePreview = (ready: ReadyExport) => {
    clearFilePreview()
    if (ready.csvText == null && !ready.filename.endsWith('.pdf')) return
    const url = URL.createObjectURL(ready.blob)
    filePreviewRef.current = url
    setFilePreview({ url, filename: ready.filename, csvText: ready.csvText })
  }

  const applySaveResult = (result: SaveBlobResult, ready: ReadyExport) => {
    if (result === 'shared' || result === 'downloaded') {
      setReadyExport(null)
      setExportNotice(null)
      clearFilePreview()
      return
    }
    if (result === 'cancelled') return
    setReadyExport(ready)
    if (result === 'blocked') {
      showFilePreview(ready)
      setExportNotice(
        ready.csvText
          ? 'This browser can’t store the file. Tap Share text, or open this page in Safari and export again.'
          : ready.filename.endsWith('.pdf')
            ? 'This browser can’t store the file. The PDF is open below. To keep a copy, open this page in Safari and export again.'
            : 'This browser can’t store the file. Open this page in Safari and export again.',
      )
      return
    }
    setExportNotice(null)
  }

  const onExport = async (fmt: 'csv' | 'xlsx' | 'pdf') => {
    if (!accessToken.trim()) return
    setExporting(fmt)
    setExportNotice(null)
    setReadyExport(null)
    clearFilePreview()
    try {
      const blob = await downloadPoolDocumentsExport(
        accessToken,
        audience,
        fmt,
        appliedRange,
        filtered.map((bundle) => bundle.loanId),
      )
      const stem =
        audience === 'admin'
          ? 'merchant_evidence_register'
          : audience === 'merchant'
            ? 'merchant_documents'
            : 'investor_pool_documents'
      const filename = `${stem}.${fmt}`
      const result = await saveBlobAsFile(blob, filename)
      const csvText =
        result === 'blocked' && filename.endsWith('.csv') && blob.size <= 1_000_000
          ? await blob.text()
          : null
      applySaveResult(result, { blob, filename, csvText })
    } catch (e) {
      setExportNotice(toUserFacingError(e, 'Export failed'))
    } finally {
      setExporting(null)
    }
  }

  const onShareReadyText = () => {
    if (!readyExport?.csvText) return
    const ready = readyExport
    void saveBlobAsFile(ready.blob, ready.filename, {
      textOnly: true,
      csvText: ready.csvText,
    }).then((result) => {
      applySaveResult(result, ready)
    })
  }

  const periodLabel = formatAppliedPeriod(appliedRange)
  const emptyReason: 'search' | 'period' | 'empty' =
    docs.length > 0 && searchTerm.trim()
      ? 'search'
      : appliedRange.from || appliedRange.to
        ? 'period'
        : 'empty'
  const loadingTitle =
    audience === 'admin'
      ? 'Loading the evidence register'
      : audience === 'merchant'
        ? 'Loading documents'
        : 'Loading pool documents'
  const loadingDescription =
    audience === 'admin'
      ? 'Fetching financed receivables for internal review…'
      : 'Fetching agreements, invoices, and verification summaries…'

  return (
    <div className="flex flex-col gap-4">
      <DashboardRequestFeedbackLayer
        phase={feedbackPhase}
        loadingTitle={loadingTitle}
        loadingDescription={loadingDescription}
        errorTitle={
          audience === 'admin'
            ? 'Unable to load the evidence register'
            : audience === 'merchant'
              ? 'Unable to load documents'
              : 'Unable to load pool documents'
        }
        errorDescription={error ?? undefined}
        onDismiss={() => setPhase('idle')}
        onRetry={load}
        onCancelLoading={() => setPhase('idle')}
      />

      <div className="rounded-[8px] border border-[#E6E8EC] bg-[#F8FAFC] px-4 py-3 sm:px-5">
        <p className="text-[13px] sm:text-[14px] text-[#4D5D80] leading-relaxed">
          {audience === 'admin'
            ? 'Every receivable Fist Commerce has financed, for internal review. The list and the downloaded files use the same dates and search.'
            : audience === 'merchant'
            ? 'Your financed receivables, with identity verification, admin authority, insurance or manual document approval, and the verification NFT on the explorer.'
            : 'View financing agreements, invoice references, and insurance or manual approval for receivables in your pool. Didit KYC stays on the account. Identity documents are never exposed to investors.'}
        </p>
      </div>

      <div className="rounded-[10px] border border-[#E6E8EC] bg-white px-4 py-4 shadow-sm lg:px-8">
        <PoolDocumentRangeControls
          periodLabel={periodLabel}
          fromDate={fromDate}
          toDate={toDate}
          exporting={exporting}
          exportDisabled={phase === 'loading'}
          exportNotice={exportNotice}
          shareTextReady={Boolean(readyExport?.csvText)}
          onFromDate={setFromDate}
          onToDate={setToDate}
          onApply={applyRange}
          onExport={(fmt) => void onExport(fmt)}
          onShareText={onShareReadyText}
        />
        {filePreview && (filePreview.csvText != null || filePreview.filename.endsWith('.pdf')) ? (
          <div className="mt-3 overflow-hidden rounded-[8px] border border-[#E6E8EC]">
            {filePreview.csvText != null ? (
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words bg-[#F8FAFC] p-3 text-[12px] leading-relaxed text-[#0B1220]">
                {filePreview.csvText}
              </pre>
            ) : filePreview.filename.endsWith('.pdf') ? (
              <iframe title={filePreview.filename} src={filePreview.url} className="h-[70vh] w-full bg-white" />
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Mobile list */}
      <section className="lg:hidden rounded-[10px] border border-[#E6E8EC] bg-white overflow-hidden shadow-sm">
        <div className="flex flex-col gap-3 px-4 py-4 border-b border-[#EDF0F4]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[#0B1220] font-bold text-[18px]">
              {title}{showTable ? ` (${filtered.length})` : ''}
            </h2>
            <button
              type="button"
              onClick={load}
              className="h-9 px-3 rounded-[6px] border border-[#E6E8EC] bg-white text-[#0B1220] text-[13px] font-semibold hover:bg-[#F9FAFB] transition-colors"
            >
              Refresh
            </button>
          </div>
          {docs.length > 0 ? (
            <div className="h-[42px] rounded-[6px] border border-[#D5DAE2] px-3 flex items-center gap-2">
              <SearchIcon />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search documents"
                className="w-full min-w-0 bg-transparent outline-none text-[#4D5D80] text-[13px] placeholder:text-[#B0B7C4]"
                aria-label="Search pool documents"
              />
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 p-3">
          {!showTable ? (
            <AsyncTableBodyMessage
              message="Loading documents…"
              variant="loading"
              layout="mobile-block"
              colSpan={DESKTOP_COLUMNS}
              mobileClassName="px-2 py-8"
            />
          ) : filtered.length === 0 ? (
            <EmptyDocumentsState reason={emptyReason} audience={audience} />
          ) : (
            pageItems.map((bundle) => (
              <PoolDocumentCard
                key={bundle.loanId}
                bundle={bundle}
                active={bundle.loanId === selectedLoanId}
                onToggle={() =>
                  setSelectedLoanId((id) => (id === bundle.loanId ? null : bundle.loanId))
                }
              />
            ))
          )}
        </div>
        <ListPagination meta={meta} onPageChange={setPage} variant="dashboard" />
      </section>

      {/* Desktop table */}
      <section className="hidden lg:block rounded-[10px] border border-[#E6E8EC] bg-white overflow-hidden shadow-sm">
        <div className="flex flex-col gap-4 px-8 py-6 border-b border-[#EDF0F4]">
          <div className="flex items-center justify-between gap-4">
          <h2 className="text-[#0B1220] font-bold text-[20px]">
            {title}{showTable ? ` (${filtered.length})` : ''}
          </h2>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {docs.length > 0 ? (
              <div className="h-[46px] w-full sm:w-[320px] rounded-[6px] border border-[#D5DAE2] px-4 flex items-center gap-2 shrink-0">
                <SearchIcon />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by loan, merchant, or invoice"
                  className="w-full min-w-0 bg-transparent outline-none text-[#4D5D80] text-[14px] placeholder:text-[#B0B7C4]"
                  aria-label="Search pool documents"
                />
              </div>
            ) : null}
            <button
              type="button"
              onClick={load}
              className="h-[46px] px-4 rounded-[6px] border border-[#E6E8EC] bg-white text-[#0B1220] text-[14px] font-semibold hover:bg-[#F9FAFB] transition-colors shrink-0"
            >
              Refresh
            </button>
          </div>
          </div>
        </div>

        <div className="px-4 pb-4 pt-3">
          <table className="w-full table-fixed text-left text-[13px] border-collapse">
            <colgroup>
              <col className="w-[20%]" />
              <col className="w-[16%]" />
              <col className="w-[10%]" />
              <col className="w-[22%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead>
              <tr className="bg-[#F8FAFC] text-[#4D5D80] border-b border-[#E6E8EC]">
                <th className="px-3 py-3 font-semibold">Merchant wallet</th>
                <th className="px-3 py-3 font-semibold">Business name</th>
                <th className="px-3 py-3 font-semibold">Amount</th>
                <th className="px-3 py-3 font-semibold">Verification</th>
                <th className="px-3 py-3 font-semibold">Updated</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {!showTable ? (
                <AsyncTableBodyMessage
                  message="Loading documents…"
                  variant="loading"
                  layout="desktop"
                  colSpan={DESKTOP_COLUMNS}
                />
              ) : filtered.length === 0 ? (
                <tr className="border-b border-[#EDF0F4] bg-white">
                  <td colSpan={DESKTOP_COLUMNS} className="px-3 py-10">
                    <EmptyDocumentsState
                      reason={emptyReason}
                      audience={audience}
                      compact
                    />
                  </td>
                </tr>
              ) : (
                pageItems.map((bundle, rowIndex) => {
                  const active = bundle.loanId === selectedLoanId
                  return (
                    <Fragment key={bundle.loanId}>
                    <tr
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setSelectedLoanId((id) => (id === bundle.loanId ? null : bundle.loanId))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedLoanId((id) =>
                            id === bundle.loanId ? null : bundle.loanId,
                          )
                        }
                      }}
                      className={[
                        'border-b border-[#EDF0F4] cursor-pointer transition-colors',
                        active
                          ? 'bg-[#EEF6FF]'
                          : rowIndex % 2 === 1
                            ? 'bg-[#F4F7F9] hover:bg-[#EEF6FF]'
                            : 'bg-white hover:bg-[#EEF6FF]',
                      ].join(' ')}
                    >
                      <td className="px-3 py-3">
                        <p
                          className="truncate font-medium font-mono text-[#0B1220]"
                          title={merchantWallet(bundle) || undefined}
                        >
                          {merchantWallet(bundle) ? shortId(merchantWallet(bundle)) : '—'}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-[#0B1220]">
                        <p className="truncate" title={merchantLabel(bundle)}>
                          {merchantLabel(bundle)}
                        </p>
                      </td>
                      <td
                        className="px-3 py-3 text-[#195EBC] font-semibold tabular-nums"
                        title={bundle.loanAmount || undefined}
                      >
                        {compactAmount(bundle.loanAmount)}
                      </td>
                      <td className="px-3 py-3 text-[#0B1220]">
                        <span className="line-clamp-2" title={verificationLabel(bundle)}>
                          {verificationLabel(bundle)}
                        </span>
                      </td>
                      <td
                        className="px-3 py-3 text-[#0B1220] tabular-nums"
                        title={bundle.updatedAt || undefined}
                      >
                        {formatAge(bundle.updatedAt)}
                      </td>
                      <td className="px-3 py-3">
                        <CompletenessChip complete={bundle.completeness.complete} />
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-[#195EBC] text-[13px] font-semibold">
                          {active ? 'Hide' : 'View'}
                          <img
                            src={primeChevronRight}
                            alt=""
                            className={[
                              'h-3.5 w-3.5 object-contain opacity-80 transition-transform',
                              active ? 'rotate-90' : '',
                            ].join(' ')}
                          />
                        </span>
                      </td>
                    </tr>
                    {active ? (
                      <tr
                        data-pool-detail={bundle.loanId}
                        className="scroll-mt-4 border-b border-[#EDF0F4] bg-[#F8FAFC]"
                      >
                        <td colSpan={DESKTOP_COLUMNS} className="px-3 py-5">
                          <EvidenceBundlePanel bundle={bundle} title={receivableTitle(bundle)} />
                        </td>
                      </tr>
                    ) : null}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <ListPagination meta={meta} onPageChange={setPage} variant="dashboard" />
      </section>
    </div>
  )
}

function PoolDocumentCard({
  bundle,
  active,
  onToggle,
}: {
  bundle: ReceivableEvidenceBundle
  active: boolean
  onToggle: () => void
}) {
  const businessName = merchantLabel(bundle)
  const named = businessName !== '—'
  const wallet = merchantWallet(bundle)
  return (
    <article
      className={[
        'rounded-[10px] border bg-white overflow-hidden',
        active ? 'border-[#195EBC]' : 'border-[#E6E8EC]',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={active}
        className="w-full px-4 py-4 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] text-[#6B7488]">Business name</p>
            <p className="mt-0.5 truncate text-[16px] font-semibold text-[#0B1220]">
              {named ? businessName : 'Name not on file'}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[12px] text-[#6B7488]">Status</p>
            <div className="mt-1 flex justify-end">
              <CompletenessChip complete={bundle.completeness.complete} />
            </div>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          <div className="col-span-2">
            <dt className="text-[12px] text-[#6B7488]">Merchant wallet</dt>
            <dd
              className="mt-0.5 truncate font-mono text-[13px] text-[#0B1220]"
              title={wallet || undefined}
            >
              {wallet ? shortId(wallet) : 'Not recorded'}
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-[#6B7488]">Amount</dt>
            <dd
              className="mt-0.5 text-[15px] font-semibold tabular-nums text-[#195EBC]"
              title={bundle.loanAmount || undefined}
            >
              {compactAmount(bundle.loanAmount)}
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-[#6B7488]">Updated</dt>
            <dd className="mt-0.5 text-[14px] tabular-nums text-[#0B1220]" title={bundle.updatedAt || undefined}>
              {formatAge(bundle.updatedAt)}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-[12px] text-[#6B7488]">Verification</dt>
            <dd className="mt-0.5 line-clamp-2 text-[14px] text-[#0B1220]" title={verificationLabel(bundle)}>
              {verificationLabel(bundle)}
            </dd>
          </div>
        </dl>

        <span className="mt-4 flex items-center justify-between border-t border-[#EDF0F4] pt-3 text-[13px] font-semibold text-[#195EBC]">
          {active ? 'Hide details' : 'View details'}
          <img
            src={primeChevronRight}
            alt=""
            className={[
              'h-4 w-4 object-contain opacity-80 transition-transform',
              active ? 'rotate-90' : '',
            ].join(' ')}
          />
        </span>
      </button>
      {active ? (
        <div data-pool-detail={bundle.loanId} className="scroll-mt-4 border-t border-[#EDF0F4] px-2 py-3">
          <EvidenceBundlePanel bundle={bundle} title={receivableTitle(bundle)} />
        </div>
      ) : null}
    </article>
  )
}

function CompletenessChip({ complete }: { complete: boolean }) {
  return (
    <span
      className={`inline-flex items-center text-[12px] px-2 py-1 rounded font-medium ${
        complete ? 'bg-[#E8F7EE] text-[#166534]' : 'bg-[#FEF3C7] text-[#92400E]'
      }`}
    >
      {complete ? 'Complete' : 'Incomplete'}
    </span>
  )
}

function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      className="shrink-0 text-[#B0B7C4]"
      aria-hidden
    >
      <path
        d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15ZM21 21l-4.35-4.35"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function EmptyDocumentsState({
  reason,
  audience,
  compact = false,
}: {
  reason: 'search' | 'period' | 'empty'
  audience: 'investor' | 'merchant' | 'admin'
  compact?: boolean
}) {
  const title =
    reason === 'search'
      ? 'No matching documents'
      : reason === 'period'
        ? 'No receivables in this period'
        : audience === 'admin'
          ? 'No financed receivables yet'
          : audience === 'merchant'
            ? 'No documents yet'
            : 'No pool documents yet'
  const detail =
    reason === 'search'
      ? 'Try a different business name, wallet, or receivable.'
      : reason === 'period'
        ? 'None of the financed receivables were created, paid, or repaid between these dates.'
        : audience === 'admin'
          ? 'When a receivable is financed, it will appear in this register.'
          : audience === 'merchant'
            ? 'When your receivables are financed, agreements and verification summaries will appear here.'
            : 'When receivables are financed in your pool, agreements and verification summaries will appear here.'
  return (
    <div
      className={[
        'flex flex-col items-center text-center',
        compact ? 'py-4' : 'px-4 py-10',
      ].join(' ')}
      role="status"
    >
      <img src={docChecked} alt="" className="h-12 w-12 object-contain opacity-80" />
      <p className="mt-4 text-[#0B1220] text-[15px] font-semibold">{title}</p>
      <p className="mt-1.5 text-[#6B7488] text-[13px] max-w-[360px] leading-relaxed">{detail}</p>
      {reason === 'empty' && audience === 'investor' ? (
        <Link
          to={DEFAULT_POOL_PATH}
          className="mt-5 inline-flex h-10 items-center justify-center rounded-[6px] bg-[#195EBC] px-4 text-[13px] font-semibold text-white hover:bg-[#154A96] transition-colors"
        >
          View lending pool
        </Link>
      ) : null}
    </div>
  )
}
