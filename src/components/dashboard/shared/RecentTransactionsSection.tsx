import { blockExplorerLinkLabel } from '@/api/payout'
import type { RecentTx } from '@/components/dashboard/investor/lending-pool-detail/types'
import { POOL_SECTION_TITLE } from '@/components/dashboard/shared/poolDetailTypography'
import { ListPagination } from '@/components/shared/ListPagination'
import type { ListPaginationMeta } from '@/utils/listPagination'

const EMPTY_TRANSACTIONS_MESSAGE = 'No recent transactions yet.'

function ExternalLinkGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

const amountClass = (tone: RecentTx['amountTone']) => {
  if (tone === 'positive') return 'text-[#16A34A] font-bold text-[15px] tabular-nums'
  if (tone === 'negative') return 'text-[#0B1220] font-bold text-[15px] tabular-nums'
  return 'text-[#0B1220] font-semibold text-[15px] tabular-nums'
}

export type RecentTransactionsSectionProps = {
  transactions: RecentTx[]
  paginationMeta: ListPaginationMeta
  onPageChange: (page: number) => void
  loading?: boolean
  /** When set, shows an explorer link next to the section title. */
  contractExplorerHref?: string | null
  /** Wrap in a bordered card section (default true). Set false when nested inside another card. */
  bordered?: boolean
  className?: string
}

/**
 * Paginated recent pool transactions list (shared by investor & merchant pool detail).
 */
export function RecentTransactionsSection({
  transactions,
  paginationMeta,
  onPageChange,
  loading = false,
  contractExplorerHref = null,
  bordered = true,
  className = '',
}: RecentTransactionsSectionProps) {
  const explorerLabel = blockExplorerLinkLabel(contractExplorerHref)
  const body = (
    <>
      <div className="flex flex-row flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className={POOL_SECTION_TITLE}>Recent Transactions</h2>
        {contractExplorerHref ? (
          <a
            href={contractExplorerHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[#195EBC] text-[15px] font-semibold hover:underline shrink-0"
          >
            {explorerLabel}
            <ExternalLinkGlyph className="opacity-90" />
          </a>
        ) : null}
      </div>

      <div className="rounded-[10px] border border-[#E6E8EC] overflow-hidden bg-white">
        {loading ? (
          <p className="px-4 py-8 text-[#6B7488] text-[14px]">Loading recent transactions…</p>
        ) : transactions.length === 0 ? (
          <p className="px-4 py-8 text-[#6B7488] text-[14px]">{EMPTY_TRANSACTIONS_MESSAGE}</p>
        ) : (
          <ul className="divide-y divide-[#E6E8EC]">
            {transactions.map((tx) => (
              <li key={tx.id}>
                <div className="flex flex-col gap-3 py-3 px-4 sm:flex-row sm:items-center sm:gap-8">
                  <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                    {tx.walletExplorerHref ? (
                      <a
                        href={tx.walletExplorerHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex w-fit max-w-full rounded-[6px] border border-[#E8EBF0] bg-[#F4F7F9] px-2.5 py-1 text-[#195EBC] text-[13px] font-medium tracking-tight hover:bg-[#E8EFFB]"
                      >
                        {tx.walletShort}
                      </a>
                    ) : (
                      <span className="inline-flex w-fit max-w-full rounded-[6px] border border-[#E8EBF0] bg-[#F4F7F9] px-2.5 py-1 text-[#195EBC] text-[13px] font-medium tracking-tight">
                        {tx.walletShort}
                      </span>
                    )}
                    <span className="text-[#0B1220] font-bold text-[15px] leading-tight">{tx.type}</span>
                  </div>
                  <div className="flex flex-row items-center justify-between gap-6 sm:justify-end sm:shrink-0 sm:min-w-56">
                    <p className={`text-left sm:text-right sm:flex-1 ${amountClass(tx.amountTone)}`}>{tx.amount}</p>
                    <p className="text-[#8B92A3] text-[13px] text-right whitespace-nowrap sm:min-w-22">
                      {tx.timeAgo}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <ListPagination
          meta={paginationMeta}
          onPageChange={onPageChange}
          loading={loading}
          variant="dashboard"
          alwaysShow
          className="border-t border-[#E6E8EC]"
        />
      </div>
    </>
  )

  if (!bordered) {
    return <div className={className}>{body}</div>
  }

  return (
    <section className={`rounded-[12px] border border-[#E6E8EC] bg-white p-6 lg:p-8 shadow-sm ${className}`.trim()}>
      {body}
    </section>
  )
}
