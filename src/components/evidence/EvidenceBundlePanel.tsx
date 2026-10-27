import type { EvidenceTimelineStep, EvidenceTxLink, ReceivableEvidenceBundle, VerificationSummary } from '@/api/evidence'

type Props = {
  bundle: ReceivableEvidenceBundle
  title?: string
}

type StatusTone = 'done' | 'open' | 'warn'

function agreementVersionLabel(version: unknown): string {
  const value = String(version || '').trim()
  if (!value) return 'Version not recorded'
  if (/^v/i.test(value)) return `Version ${value.slice(1)}`
  return `Version ${value}`
}

function formatWhen(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function formatDay(value: string | null | undefined): string {
  if (!value) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return formatWhen(value)
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return date.toLocaleDateString(undefined, { dateStyle: 'medium' })
}

function formatMoney(value: string | null | undefined): string {
  if (value == null || value === '') return '—'
  const amount = Number(value)
  if (!Number.isFinite(amount)) return value
  const formatted = Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return amount < 0 ? `-$${formatted}` : `$${formatted}`
}

function shortId(value: string | null | undefined): string {
  const raw = (value || '').trim()
  if (!raw) return '—'
  if (raw.length <= 13) return raw
  return `${raw.slice(0, 6)}…${raw.slice(-4)}`
}

function headingFor(bundle: ReceivableEvidenceBundle, title: string): string {
  if (bundle.loanName) return bundle.loanName
  const id = shortId(bundle.receivableId)
  if (id !== '—') return id
  return title
}

function describeStatus(bundle: ReceivableEvidenceBundle): { label: string; sentence: string; tone: StatusTone } {
  const items = bundle.completeness?.items ?? {}
  if (bundle.loanStatus === 'defaulted') {
    return {
      label: 'Defaulted',
      sentence: 'This receivable is in default.',
      tone: 'warn',
    }
  }
  if (bundle.completeness.complete) {
    return {
      label: 'Repaid',
      sentence: 'The merchant has repaid this receivable.',
      tone: 'done',
    }
  }
  if (items.repaid) {
    const missing: string[] = []
    if (!items.merchantVerified) missing.push('merchant verification')
    if (!items.agreementAccepted) missing.push('a financing agreement')
    if (!items.invoicePresent) missing.push('the document hash')
    if (!items.receivableIdPresent) missing.push('a receivable id')
    const list = missing.length ? missing.join(', ') : 'supporting records'
    return {
      label: 'Records incomplete',
      sentence: `Repayment is recorded. Still missing ${list}.`,
      tone: 'warn',
    }
  }
  return {
    label: 'Outstanding',
    sentence: 'The merchant has not repaid this receivable.',
    tone: 'open',
  }
}

function stepCopy(step: EvidenceTimelineStep): { title: string; detail: string } {
  const done = step.status === 'complete'
  if (step.key === 'invoice_approved') {
    return {
      title: 'Approved on chain',
      detail: done
        ? 'The invoice was approved for financing.'
        : 'Waiting for on-chain approval.',
    }
  }
  if (step.key === 'funded') {
    return {
      title: 'Funded from the pool',
      detail: done ? 'Capital was drawn from the pool.' : 'Waiting for funding.',
    }
  }
  if (step.key.startsWith('paid_out')) {
    const indexed = step.label.match(/(\d+)\s*$/)
    const suffix = indexed ? ` (${indexed[1]})` : ''
    return {
      title: done ? `Paid to the merchant${suffix}` : `Payout${suffix}`,
      detail: done ? 'The advance was sent to the merchant.' : 'Waiting to pay the merchant.',
    }
  }
  if (step.key.startsWith('repayment')) {
    const indexed = step.label.match(/(\d+)\s*$/)
    const suffix = indexed ? ` (${indexed[1]})` : ''
    return {
      title: done ? `Repaid by the merchant${suffix}` : `Repayment${suffix}`,
      detail: done ? 'The merchant repaid the pool.' : 'Waiting for the merchant to repay.',
    }
  }
  if (step.key === 'completed') {
    if (step.label === 'Defaulted') {
      return { title: 'Defaulted', detail: 'This receivable is in default.' }
    }
    return {
      title: done ? 'Settled' : 'Still open',
      detail: done ? 'This receivable is closed.' : 'Closes once the receivable is repaid.',
    }
  }
  return { title: step.label, detail: step.detail || '' }
}

function checkValue(summary: VerificationSummary | null | undefined, approvedLabel: string): string {
  const status = (summary?.status || '').toLowerCase()
  if (status === 'approved') return approvedLabel
  if (status === 'under review') return 'Under review'
  if (status === 'pending') return 'Pending'
  if (status === 'rejected') return 'Rejected'
  return 'Not recorded'
}

function reviewerLabel(reviewer: string | null | undefined): string {
  const raw = (reviewer || '').trim()
  if (!raw) return ''
  const wallet = raw.split(':')[0]
  if (/^0x[a-fA-F0-9]{8,}$/.test(wallet)) return `Reviewed by ${shortId(wallet)}`
  return `Reviewed by ${raw}`
}

function TxAnchor({
  tx,
  children,
  className,
  title,
}: {
  tx: EvidenceTxLink | null | undefined
  children: string
  className?: string
  title?: string
}) {
  const classes =
    className || 'font-semibold text-[#195EBC] underline-offset-2 hover:underline'
  if (!tx?.explorerUrl) return <span className="break-all text-[#0B1220]">{children}</span>
  return (
    <a
      href={tx.explorerUrl}
      target="_blank"
      rel="noreferrer"
      title={title}
      className={classes}
    >
      {children}
    </a>
  )
}

function StatusMark({ tone, label }: { tone: StatusTone; label: string }) {
  const toneClass =
    tone === 'done'
      ? 'bg-[#E8F7EE] text-[#166534]'
      : tone === 'warn'
        ? 'bg-[#FEF3C7] text-[#92400E]'
        : 'bg-[#EEF4FC] text-[#195EBC]'
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold ${toneClass}`}>
      {label}
    </span>
  )
}

function SectionTitle({ children, hint }: { children: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-[15px] font-semibold text-[#0B1220]">{children}</h3>
      {hint ? <p className="mt-0.5 text-[12px] leading-relaxed text-[#6B7488]">{hint}</p> : null}
    </div>
  )
}

function Timeline({ steps }: { steps: EvidenceTimelineStep[] }) {
  const currentIndex = steps.findIndex((step) => step.status !== 'complete')
  return (
    <ol>
      {steps.map((step, index) => {
        const done = step.status === 'complete'
        const current = index === currentIndex
        const last = index === steps.length - 1
        const copy = stepCopy(step)
        const when = formatWhen(step.occurredAt)
        const movesMoney = step.key.startsWith('paid_out') || step.key.startsWith('repayment')
        const amountValue = Number(step.amount)
        const showAmount =
          done &&
          movesMoney &&
          step.amount != null &&
          step.amount !== '' &&
          Number.isFinite(amountValue) &&
          amountValue !== 0
        return (
          <li key={step.key} className="grid grid-cols-[18px_minmax(0,1fr)] gap-3">
            <div className="flex flex-col items-center">
              <span
                className={[
                  'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
                  done ? 'bg-[#166534]' : current ? 'bg-white ring-2 ring-[#195EBC]' : 'bg-[#D5DAE2]',
                ].join(' ')}
              />
              {last ? null : (
                <span className={`mt-1 w-px flex-1 ${done ? 'bg-[#BBF7D0]' : 'bg-[#E6E8EC]'}`} />
              )}
            </div>
            <div className={last ? 'pb-0' : 'pb-5'}>
              <div className="flex items-baseline justify-between gap-3">
                <p className={`text-[14px] font-semibold ${done || current ? 'text-[#0B1220]' : 'text-[#8B92A3]'}`}>
                  {copy.title}
                </p>
                {showAmount ? (
                  <p className="shrink-0 text-[13px] font-semibold tabular-nums text-[#0B1220]">
                    {formatMoney(step.amount)}
                  </p>
                ) : null}
              </div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-[#4D5D80]">{copy.detail}</p>
              {when ? <p className="mt-1 text-[12px] text-[#6B7488]">{when}</p> : null}
              {step.tx?.explorerUrl ? (
                <p className="mt-1 text-[12px]">
                  <TxAnchor tx={step.tx}>
                    {step.tx.shortHash ? `Transaction ${step.tx.shortHash}` : 'View transaction'}
                  </TxAnchor>
                </p>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function CheckRow({
  label,
  value,
  meta,
  link,
}: {
  label: string
  value?: string
  meta?: string
  link?: { href: string; label: string }
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#F0F2F5] py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-[#0B1220]">{label}</p>
        {meta ? <p className="mt-0.5 text-[12px] leading-relaxed text-[#6B7488]">{meta}</p> : null}
      </div>
      {link ? (
        <a
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-right text-[13px] font-semibold text-[#195EBC] hover:underline"
        >
          {link.label}
        </a>
      ) : (
        <p className="shrink-0 text-right text-[13px] text-[#0B1220]">{value}</p>
      )}
    </div>
  )
}

export default function EvidenceBundlePanel({ bundle, title = 'Receivable' }: Props) {
  const merchant = bundle.merchant as Record<string, string | number | null> | null
  const agreement = bundle.agreement as Record<string, string | null> | null
  const timeline = bundle.timeline
  const receivableTx = timeline?.receivableTx ?? null
  const status = describeStatus(bundle)
  const merchantName = (merchant?.businessName as string) || (merchant?.fullName as string) || ''
  const merchantMeta = [merchant?.businessIndustry, merchant?.businessCountry].filter(Boolean).join(' · ')
  const identityWhen = formatWhen(bundle.identityVerification?.verificationDate)
  const authorityWhen = formatWhen(bundle.authorityVerification?.reviewDate)
  const documentWhen = formatWhen(bundle.verification?.verificationDate)
  const authorityMeta = [reviewerLabel(bundle.authorityVerification?.reviewer), authorityWhen]
    .filter(Boolean)
    .join(' · ')
  const documentHash = bundle.invoice?.invoiceReference || ''
  const receivableId = (bundle.receivableId || '').trim()
  const headingIsReceivableId = !bundle.loanName && Boolean(receivableId)
  const idLinkClass =
    'break-all font-mono text-[12px] font-medium leading-relaxed text-[#195EBC] underline-offset-2 hover:underline'

  return (
    <section className="rounded-[12px] border border-[#E6E8EC] bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-[#6B7488]">Receivable</p>
          <h2
            className={
              headingIsReceivableId
                ? 'mt-1 break-all font-mono text-[13px] font-semibold leading-relaxed text-[#0B1220]'
                : 'mt-0.5 truncate text-[18px] font-semibold text-[#0B1220]'
            }
          >
            {headingIsReceivableId ? (
              <TxAnchor
                tx={receivableTx}
                className={idLinkClass}
                title="Transaction that created this receivable"
              >
                {receivableId}
              </TxAnchor>
            ) : (
              headingFor(bundle, title)
            )}
          </h2>
          <p className="mt-1 max-w-[520px] text-[14px] leading-relaxed text-[#4D5D80]">{status.sentence}</p>
        </div>
        <StatusMark tone={status.tone} label={status.label} />
      </div>

      {timeline ? (
        <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
          {[
            ['Financed', timeline.principalAmount],
            ['Repaid', timeline.repaidAmount],
            ['Interest', timeline.interestAmount],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[10px] bg-[#F8FAFC] px-3 py-3">
              <p className="text-[12px] text-[#6B7488]">{label}</p>
              <p className="mt-1 text-[16px] font-semibold tabular-nums text-[#0B1220] sm:text-[18px]">
                {formatMoney(value)}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <SectionTitle hint="From approval through repayment.">What happened</SectionTitle>
          {timeline?.steps?.length ? (
            <Timeline steps={timeline.steps} />
          ) : (
            <p className="text-[13px] text-[#6B7488]">No financing activity recorded yet.</p>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <div>
            <SectionTitle>Merchant</SectionTitle>
            <p className={`text-[15px] ${merchantName ? 'font-semibold text-[#0B1220]' : 'text-[#6B7488]'}`}>
              {merchantName || 'No business name on file.'}
            </p>
            {merchantMeta ? <p className="mt-1 text-[13px] text-[#4D5D80]">{merchantMeta}</p> : null}
            {merchant?.businessAddress ? (
              <p className="mt-1 text-[13px] text-[#4D5D80]">{String(merchant.businessAddress)}</p>
            ) : null}
          </div>

          <div>
            <SectionTitle hint="Account checks. Identity documents stay off this page.">
              Checks
            </SectionTitle>
            <div className="rounded-[10px] border border-[#F0F2F5] px-3">
              <CheckRow
                label="Identity"
                value={checkValue(bundle.identityVerification, 'Verified')}
                meta={['Didit KYC', identityWhen].filter(Boolean).join(' · ') || undefined}
              />
              <CheckRow
                label="Authority"
                value={checkValue(bundle.authorityVerification, 'Approved')}
                meta={['Admin review', authorityMeta].filter(Boolean).join(' · ') || 'Admin review'}
              />
              <CheckRow
                label="Documents"
                value={checkValue(bundle.verification, 'Approved')}
                meta={['Insurance and manual review', documentWhen].filter(Boolean).join(' · ') || undefined}
              />
              <CheckRow
                label="Verification NFT"
                value={bundle.verificationNft?.explorerUrl ? undefined : 'Not issued'}
                meta={bundle.verificationNft?.explorerUrl ? undefined : 'No merchant verification NFT is recorded.'}
                link={
                  bundle.verificationNft?.explorerUrl
                    ? {
                        href: bundle.verificationNft.explorerUrl,
                        label: `View token ${bundle.verificationNft.tokenId}`,
                      }
                    : undefined
                }
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 rounded-[10px] bg-[#F8FAFC] px-4 py-4">
          <SectionTitle
            hint={
              (agreement as { defaultAgreement?: boolean } | null)?.defaultAgreement === true
                ? 'The standard agreement that covers this receivable.'
                : 'The terms accepted for this receivable.'
            }
          >
            Agreement
          </SectionTitle>
          {agreement ? (
            <div className="space-y-2 text-[14px] text-[#0B1220]">
              <p className="font-semibold">
                {(agreement.agreementFilename as string) || 'Financing agreement'}
              </p>
              <p>{agreementVersionLabel(agreement.agreementVersion)}</p>
              <p>
                Amount to repay{' '}
                <span className="font-semibold tabular-nums">
                  {formatMoney(String(agreement.repaymentAmount ?? ''))}
                </span>
              </p>
              {agreement.dueDate ? <p>Due {formatDay(agreement.dueDate)}</p> : null}
              {agreement.agreementUrl ? (
                <a
                  href={agreement.agreementUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex text-[13px] font-semibold text-[#195EBC] hover:underline"
                >
                  View agreement
                </a>
              ) : null}
            </div>
          ) : (
            <p className="text-[14px] text-[#6B7488]">No financing agreement on file.</p>
          )}
        </div>

        <div className="min-w-0 rounded-[10px] bg-[#F8FAFC] px-4 py-4">
          <SectionTitle hint="Identifiers recorded with the invoice.">On-chain record</SectionTitle>
          <div className="space-y-4">
            <div>
              <p className="text-[13px] font-semibold text-[#0B1220]">Document hash</p>
              {documentHash ? (
                <>
                  <p className="mt-1 break-all font-mono text-[12px] leading-relaxed text-[#0B1220]">
                    {documentHash}
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-[#6B7488]">
                    Stored on chain when this invoice was approved.
                  </p>
                  {bundle.invoice?.documentUrl ? (
                    <a
                      href={bundle.invoice.documentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex text-[13px] font-semibold text-[#195EBC] hover:underline"
                    >
                      View invoice
                    </a>
                  ) : null}
                </>
              ) : (
                <p className="mt-1 text-[13px] text-[#6B7488]">No document hash on file.</p>
              )}
            </div>
            <div>
              <p className="text-[13px] font-semibold text-[#0B1220]">Receivable id</p>
              {receivableId ? (
                <p className="mt-1">
                  <TxAnchor
                    tx={receivableTx}
                    className={idLinkClass}
                    title="Transaction that created this receivable"
                  >
                    {receivableId}
                  </TxAnchor>
                </p>
              ) : (
                <p className="mt-1 text-[13px] text-[#6B7488]">Not recorded</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {bundle.payoutReadiness ? (
        <div className="mt-4 rounded-[10px] border border-[#E6E8EC] bg-[#FAFBFD] px-4 py-3">
          <SectionTitle>Payout</SectionTitle>
          <p className="text-[14px] text-[#0B1220]">
            {bundle.payoutReadiness.ready
              ? 'Ready to pay the merchant.'
              : 'Payout is held until the items below are resolved.'}
          </p>
          {!bundle.payoutReadiness.ready ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-[#92400E]">
              {bundle.payoutReadiness.failures.map((failure) => (
                <li key={failure.code}>{failure.message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
