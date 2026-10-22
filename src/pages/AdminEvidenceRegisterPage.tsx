import { useCallback, useEffect, useState } from 'react'

import {
  downloadEvidenceRegisterExport,
  fetchEvidenceRegister,
  type EvidenceRegisterRow,
} from '@/api/evidence'
import { toUserFacingError } from '@/api/client'
import { useAppSelector } from '@/store/hooks'

export default function AdminEvidenceRegisterPage() {
  const accessToken = useAppSelector((s) => s.auth.accessToken) || ''
  const [rows, setRows] = useState<EvidenceRegisterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [appliedRange, setAppliedRange] = useState<{ from?: string; to?: string }>({})
  const [exporting, setExporting] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError(null)
    try {
      const data = await fetchEvidenceRegister(accessToken, appliedRange)
      setRows(data.rows || [])
    } catch (e) {
      setError(toUserFacingError(e, 'Failed to load evidence register'))
    } finally {
      setLoading(false)
    }
  }, [accessToken, appliedRange])

  useEffect(() => {
    void load()
  }, [load])

  const onExport = async (fmt: 'csv' | 'xlsx' | 'pdf') => {
    if (!accessToken) return
    setExporting(fmt)
    try {
      const blob = await downloadEvidenceRegisterExport(accessToken, fmt, appliedRange)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `merchant_evidence_register.${fmt}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(toUserFacingError(e, 'Export failed'))
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold text-[#0B1220]">Merchant Evidence Register</h1>
          <p className="text-sm text-[#6B7488] mt-1">
            One row per funded invoice from the same records used by the platform.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex flex-col gap-1 text-[12px] text-[#6B7488]">
            From
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-9 rounded-[6px] border border-[#D5DAE2] px-2 text-[13px] text-[#0B1220]"
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-[#6B7488]">
            To
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-9 rounded-[6px] border border-[#D5DAE2] px-2 text-[13px] text-[#0B1220]"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              if (fromDate && toDate && fromDate > toDate) {
                setError('The start date must be on or before the end date.')
                return
              }
              setAppliedRange({ from: fromDate || undefined, to: toDate || undefined })
            }}
            className="self-end h-9 px-3 rounded-[6px] border border-[#E6E8EC] bg-white text-[#0B1220] text-sm font-medium"
          >
            Apply
          </button>
          {(['csv', 'xlsx', 'pdf'] as const).map((fmt) => (
            <button
              key={fmt}
              type="button"
              disabled={!!exporting}
              onClick={() => void onExport(fmt)}
              className="px-3 py-2 rounded-[6px] bg-[#195EBC] text-white text-sm font-medium disabled:opacity-60"
            >
              {exporting === fmt ? 'Exporting…' : `Export ${fmt.toUpperCase()}`}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="text-sm text-[#B91C1C]" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? <p className="text-sm text-[#6B7488]">Loading…</p> : null}

      <div className="overflow-x-auto rounded-[10px] border border-[#DFE2E8] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#F7F8FA] text-[#6B7488]">
            <tr>
              <th className="px-3 py-2 font-medium">Merchant</th>
              <th className="px-3 py-2 font-medium">Agreement</th>
              <th className="px-3 py-2 font-medium">Verification</th>
              <th className="px-3 py-2 font-medium">Invoice</th>
              <th className="px-3 py-2 font-medium">Amount</th>
              <th className="px-3 py-2 font-medium">Receivable ID</th>
              <th className="px-3 py-2 font-medium">Transactions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.loanId} className="border-t border-[#EDF0F4] align-top">
                <td className="px-3 py-2 text-[#0B1220]">{row.merchant}</td>
                <td className="px-3 py-2 text-[#0B1220]">{row.agreementFilename || '—'}</td>
                <td className="px-3 py-2 text-[#0B1220]">{row.verificationMethodEvidence || '—'}</td>
                <td className="px-3 py-2 text-[#0B1220] break-all max-w-[160px]">
                  {row.invoiceReference || '—'}
                </td>
                <td className="px-3 py-2 text-[#0B1220]">{row.amountFinanced}</td>
                <td className="px-3 py-2 text-[#0B1220] break-all max-w-[140px]">
                  {row.receivableId || '—'}
                </td>
                <td className="px-3 py-2">
                  <ul className="space-y-1">
                    {(row.transactions || []).map((tx) => (
                      <li key={`${tx.txHash}-${tx.eventType}`}>
                        {tx.explorerUrl ? (
                          <a
                            href={tx.explorerUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#195EBC] hover:underline"
                          >
                            {tx.shortHash} ({tx.eventType}
                            {tx.amount ? `, ${tx.amount}` : ''}
                            {tx.loanName ? `, ${tx.loanName}` : ''})
                          </a>
                        ) : (
                          <span>
                            {tx.shortHash} ({tx.eventType})
                          </span>
                        )}
                      </li>
                    ))}
                    {!row.transactions?.length ? <span className="text-[#8B92A3]">—</span> : null}
                  </ul>
                </td>
              </tr>
            ))}
            {!loading && !rows.length ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-[#8B92A3]">
                  No funded invoices yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
