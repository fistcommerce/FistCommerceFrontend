import { useCallback, useEffect, useRef, useState } from 'react'

import {
  fetchInvestorWithdrawalRequests,
  type InvestorWithdrawalRequestRow,
  type InvestorWithdrawalRequestStatus,
} from '@/api/metrics'
import { DashboardRequestFeedbackLayer } from '@/components/dashboard/shared/DashboardRequestFeedbackLayer'
import { POOL_SECTION_TITLE } from '@/components/dashboard/shared/poolDetailTypography'
import { toAppUserFacingError } from '@/errors/toAppUserFacingError'
import { useIsStellarTestnetMode } from '@/hooks/usePreferredAppNetwork'
import { useTestnetContracts } from '@/hooks/useTestnetContracts'
import { useAppSelector } from '@/store/hooks'

const STATUS_CLASS: Record<InvestorWithdrawalRequestStatus, string> = {
  pending: 'bg-[#FFF0E5] text-[#EA580C]',
  approved: 'bg-[#E7F6EC] text-[#16A34A]',
  rejected: 'bg-[#FBEAE9] text-[#EF4444]',
  executed: 'bg-[#E7F6EC] text-[#16A34A]',
  expired: 'bg-[#EEF0F4] text-[#6B7488]',
}

function StatusPill({ status, label }: { status: InvestorWithdrawalRequestStatus; label: string }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-medium ${STATUS_CLASS[status]}`}
    >
      {label}
    </span>
  )
}

const InvestorWithdrawalRequestsSection = () => {
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const stellarMode = useIsStellarTestnetMode()
  const [rows, setRows] = useState<InvestorWithdrawalRequestRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [executingKey, setExecutingKey] = useState<string | null>(null)
  const [feedbackPhase, setFeedbackPhase] = useState<'idle' | 'loading' | 'failed'>('idle')
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const withdrawInFlightRef = useRef(false)
  const lastWithdrawRowRef = useRef<InvestorWithdrawalRequestRow | null>(null)
  const contracts = useTestnetContracts()

  const loadRequests = useCallback(async () => {
    if (stellarMode || !accessToken?.trim()) return
    setLoading(true)
    setError(null)
    try {
      const data = await fetchInvestorWithdrawalRequests(accessToken, { limit: 50, offset: 0 })
      setRows(data.results)
    } catch (e) {
      setError(
        toAppUserFacingError(e, {
          fallback: 'Could not load withdrawal requests.',
          context: 'withdraw',
        }),
      )
    } finally {
      setLoading(false)
    }
  }, [accessToken, stellarMode])

  useEffect(() => {
    if (stellarMode || !accessToken?.trim()) return
    void loadRequests()
  }, [accessToken, loadRequests, stellarMode])

  if (stellarMode) {
    // Track A uses TradeCreditPool redeem, not the EVM withdrawal-request queue.
    return null
  }

  const handleWithdraw = useCallback(
    async (row: InvestorWithdrawalRequestRow) => {
      if (!row.actions.canWithdraw) return
      // Sync lock: React state alone cannot stop a double-click before re-render.
      if (withdrawInFlightRef.current || contracts.isWritePending) return
      withdrawInFlightRef.current = true
      lastWithdrawRowRef.current = row
      setExecutingKey(row.requestKey)
      setFeedbackPhase('loading')
      setFeedbackError(null)
      try {
        await contracts.executeFundingPoolWithdraw(row.requestKey as `0x${string}`)
        setFeedbackPhase('idle')
        await loadRequests()
      } catch (e) {
        const message = toAppUserFacingError(e, {
          fallback: 'Could not execute withdrawal. Please try again.',
          context: 'withdraw',
        })
        setFeedbackError(message)
        setFeedbackPhase('failed')
      } finally {
        withdrawInFlightRef.current = false
        setExecutingKey(null)
      }
    },
    [contracts, loadRequests],
  )

  const anyWithdrawBusy = executingKey != null || contracts.isWritePending

  const activeFeedbackPhase =
    executingKey || contracts.isWritePending ? 'loading' : feedbackPhase

  return (
    <>
      <DashboardRequestFeedbackLayer
        phase={activeFeedbackPhase}
        loadingTitle="Withdrawing funds"
        loadingDescription="Confirm the withdrawal in your wallet…"
        errorTitle="Unable to withdraw"
        errorDescription={feedbackError ?? undefined}
        onDismiss={() => {
          setFeedbackPhase('idle')
          setFeedbackError(null)
        }}
        onRetry={() => {
          const row = lastWithdrawRowRef.current
          setFeedbackPhase('idle')
          setFeedbackError(null)
          if (row?.actions.canWithdraw) {
            void handleWithdraw(row)
          }
        }}
      />
      <section className="rounded-[12px] border border-[#E6E8EC] bg-white p-6 lg:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h2 className={POOL_SECTION_TITLE}>Withdrawal Requests</h2>
            <p className="mt-1 text-[#6B7488] text-[14px]">
              After approval, use Withdraw to claim tokens from the funding pool.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadRequests()}
            className="text-[#195EBC] text-[14px] font-semibold hover:underline self-start sm:self-auto"
            disabled={loading || anyWithdrawBusy}
          >
            Refresh
          </button>
        </div>

        <div className="rounded-[10px] border border-[#E6E8EC] overflow-hidden bg-white">
          {loading && rows.length === 0 ? (
            <p className="px-4 py-8 text-[#6B7488] text-[14px]">Loading withdrawal requests…</p>
          ) : error && rows.length === 0 ? (
            <p className="px-4 py-8 text-[#B91C1C] text-[14px]" role="alert">
              {error}
            </p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-8 text-[#6B7488] text-[14px]">No withdrawal requests yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead>
                  <tr className="border-b border-[#E6E8EC] bg-[#FAFBFD]">
                    <th className="px-4 py-3 text-[12px] font-semibold text-[#8B92A3]">Request</th>
                    <th className="px-4 py-3 text-[12px] font-semibold text-[#8B92A3]">Amount</th>
                    <th className="px-4 py-3 text-[12px] font-semibold text-[#8B92A3]">Requested</th>
                    <th className="px-4 py-3 text-[12px] font-semibold text-[#8B92A3]">Status</th>
                    <th className="px-4 py-3 text-[12px] font-semibold text-[#8B92A3]">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const rowBusy = executingKey === row.requestKey
                    return (
                      <tr key={row.requestKey} className="border-t border-[#E6E8EC]">
                        <td className="px-4 py-3 text-[14px] font-medium text-[#0B1220] font-mono">
                          {row.id}
                        </td>
                        <td className="px-4 py-3 text-[14px] font-semibold text-[#0B1220] tabular-nums">
                          {row.amountDisplay}
                        </td>
                        <td className="px-4 py-3 text-[14px] text-[#6B7488]">{row.dateDisplay}</td>
                        <td className="px-4 py-3">
                          <StatusPill status={row.status} label={row.statusLabel} />
                        </td>
                        <td className="px-4 py-3">
                          {row.actions.canWithdraw ? (
                            <button
                              type="button"
                              disabled={anyWithdrawBusy}
                              onClick={() => void handleWithdraw(row)}
                              className="h-9 px-4 rounded-[6px] bg-[#195EBC] text-white text-[13px] font-semibold hover:bg-[#154a9a] disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {rowBusy ? 'Withdrawing…' : 'Withdraw'}
                            </button>
                          ) : (
                            <span className="text-[13px] text-[#8B92A3]">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  )
}

export default InvestorWithdrawalRequestsSection
