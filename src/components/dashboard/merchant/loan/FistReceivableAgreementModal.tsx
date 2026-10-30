import { useCallback, useEffect, useId, useRef, useState, type MouseEvent, type UIEvent } from 'react'

import AgreementDocumentBody from '@/components/dashboard/merchant/loan/AgreementDocumentBody'
import type { AgreementContentBlock } from '@/components/dashboard/merchant/loan/fistReceivableFinancingAgreement'

const SCROLL_END_THRESHOLD_PX = 28
const SCROLL_HINT =
  'Scroll to the end of the agreement to confirm that you have completed reading.'

export type FistReceivableAgreementModalProps = {
  open: boolean
  blocks: readonly AgreementContentBlock[]
  version: string
  onClose: () => void
  onConfirmRead: () => void
}

export default function FistReceivableAgreementModal({
  open,
  blocks,
  version,
  onClose,
  onConfirmRead,
}: FistReceivableAgreementModalProps) {
  const titleId = useId()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [hasReachedEnd, setHasReachedEnd] = useState(false)
  const [showScrollHint, setShowScrollHint] = useState(false)

  const checkScrollPosition = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight
    if (remaining <= SCROLL_END_THRESHOLD_PX) {
      setHasReachedEnd(true)
      setShowScrollHint(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setHasReachedEnd(false)
    setShowScrollHint(false)
    const frame = window.requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = 0
      checkScrollPosition()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, checkScrollPosition])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  if (!open) return null

  const handleOverlayClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight
    if (remaining <= SCROLL_END_THRESHOLD_PX) {
      setHasReachedEnd(true)
      setShowScrollHint(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm p-3 sm:p-5"
      role="presentation"
      onClick={handleOverlayClick}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex w-full max-w-[720px] max-h-[min(92vh,900px)] flex-col overflow-hidden rounded-[12px] border border-[#E6E8EC] bg-white shadow-xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[#E6E8EC] bg-[#F8FAFC] px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <p className="text-[#6B7488] text-[11px] font-semibold uppercase tracking-wide">
              Document reader
            </p>
            <h2
              id={titleId}
              className="mt-1 text-[#0B1220] text-[16px] sm:text-[18px] font-bold leading-snug"
            >
              FIST RECEIVABLE FINANCING AGREEMENT
            </h2>
            <p className="mt-1 text-[#6B7488] text-[12px]">
              Agreement Version: {version || '…'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] text-[#6B7488] hover:bg-[#EEF2F6] hover:text-[#0B1220]"
            aria-label="Close agreement"
          >
            <span className="text-[22px] leading-none" aria-hidden>
              ×
            </span>
          </button>
        </header>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6"
        >
          {blocks.length ? (
            <AgreementDocumentBody blocks={blocks} />
          ) : (
            <p className="text-[14px] text-[#6B7488]">Loading the agreement…</p>
          )}
        </div>

        <footer className="shrink-0 border-t border-[#E6E8EC] bg-white px-4 py-3 sm:px-5 sm:py-4">
          {!hasReachedEnd ? (
            <p className="mb-2 text-center text-[#6B7488] text-[12px]">
              Scroll to the end to enable confirmation.
            </p>
          ) : null}
          <div
            className="relative"
            onMouseEnter={() => {
              if (!hasReachedEnd) setShowScrollHint(true)
            }}
            onMouseLeave={() => setShowScrollHint(false)}
            onFocusCapture={() => {
              if (!hasReachedEnd) setShowScrollHint(true)
            }}
            onBlurCapture={() => setShowScrollHint(false)}
          >
            {showScrollHint && !hasReachedEnd ? (
              <div
                role="tooltip"
                className="absolute bottom-full left-1/2 z-10 mb-2 w-[min(100%,320px)] -translate-x-1/2 rounded-[6px] border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-center text-[#92400E] text-[12px] leading-snug shadow-sm"
              >
                {SCROLL_HINT}
              </div>
            ) : null}
            <button
              type="button"
              disabled={!hasReachedEnd}
              title={!hasReachedEnd ? SCROLL_HINT : undefined}
              onClick={onConfirmRead}
              className={`w-full rounded-[6px] py-3 text-[15px] font-semibold transition-colors ${
                hasReachedEnd
                  ? 'bg-[#1B66CF] text-white hover:bg-[#154a9a]'
                  : 'cursor-not-allowed bg-[#D1D5DB] text-[#6B7280]'
              }`}
            >
              Confirm I have read
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
