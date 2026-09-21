import { Link, Navigate, useParams } from 'react-router-dom'

import type { BridgeTransfer } from '@/api/bridge'
import BridgeTransferTracker from '@/components/bridge/BridgeTransferTracker'
import { DashboardRequestFeedbackLayer } from '@/components/dashboard/shared/DashboardRequestFeedbackLayer'
import { sourceChainLabel } from '@/bridge/explorer'
import {
  bridgeListStatusLine,
  bridgeSignLabel,
  bridgeStatusTone,
  formatBridgeStartedLine,
  sortBridgeTransfersByRecency,
  trackerPathForPurpose,
  transferNeedsSignature,
} from '@/bridge/transferStatus'
import { useActiveBridgeTransfers } from '@/hooks/useActiveBridgeTransfers'
import { useBridgeTransfer } from '@/hooks/useBridgeTransfer'
import DashboardLayout, { type DashboardBreadcrumbItem } from '@/layouts/DashboardLayout'
import { useAppSelector } from '@/store/hooks'
import { selectInvestorWalletDisplay } from '@/store/selectors/investorDashboardSelectors'
import { selectMerchantWalletDisplay } from '@/store/selectors/merchantDashboardSelectors'

type BridgeActivityPageProps = {
  role: 'investor' | 'merchant'
}

function statusDotClass(status: string): string {
  const tone = bridgeStatusTone(status)
  if (tone === 'failed') return 'bg-[#DC2626]'
  if (tone === 'ready') return 'bg-[#195EBC]'
  if (tone === 'waiting') return 'bg-[#F59E0B]'
  return 'bg-[#16A34A]'
}

function statusTextClass(status: string): string {
  const tone = bridgeStatusTone(status)
  if (tone === 'failed') return 'text-[#DC2626]'
  if (tone === 'ready') return 'text-[#195EBC]'
  if (tone === 'waiting') return 'text-[#B45309]'
  return 'text-[#6B7488]'
}

function TransferListRow({
  transfer,
  href,
  latest,
}: {
  transfer: BridgeTransfer
  href: string
  latest: boolean
}) {
  const failed = bridgeStatusTone(transfer.status) === 'failed'
  const needsSignature = transferNeedsSignature(transfer)
  return (
    <li>
      <Link
        to={href}
        className={`block rounded-[8px] border px-4 py-3 hover:border-[#195EBC]/40 ${
          failed ? 'border-[#FECACA] bg-[#FEF2F2]' : needsSignature ? 'border-[#195EBC]/40 bg-[#F8FBFF]' : 'border-[#E6E8EC] bg-white'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[#0B1220] text-[14px] font-medium">
              {transfer.amount_human || '—'} USDC ·{' '}
              {sourceChainLabel(transfer.source_chain_id, transfer.bridge_kit_source)} → Arc
            </p>
            <p className={`text-[13px] font-medium mt-1 ${statusTextClass(transfer.status)}`}>
              <span
                className={`inline-block h-2 w-2 rounded-full mr-2 align-middle ${statusDotClass(transfer.status)}`}
                aria-hidden
              />
              {bridgeListStatusLine(transfer)}
            </p>
            <p className="text-[#6B7488] text-[12px] mt-1">{formatBridgeStartedLine(transfer)}</p>
            {failed && transfer.error_message ? (
              <p className="text-[#DC2626] text-[12px] mt-1">{transfer.error_message}</p>
            ) : null}
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1">
            {needsSignature ? (
              <span className="text-[12px] font-medium text-white bg-[#195EBC] px-2.5 py-1 rounded-[6px]">
                {bridgeSignLabel()}
              </span>
            ) : latest ? (
              <span className="text-[11px] font-medium uppercase tracking-wide text-[#195EBC] bg-[#E8EFFB] px-2 py-0.5 rounded-full">
                Latest
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </li>
  )
}

const BridgeActivityPage = ({ role }: BridgeActivityPageProps) => {
  const { transferId } = useParams<{ transferId?: string }>()
  const { transfer, loading, error, refetch } = useBridgeTransfer(transferId)
  const { transfers, loading: listLoading } = useActiveBridgeTransfers({
    purpose: role === 'merchant' ? 'repayment' : 'deposit',
    enabled: !transferId,
  })
  const investorWallet = useAppSelector(selectInvestorWalletDisplay)
  const merchantWallet = useAppSelector(selectMerchantWalletDisplay)

  const base = role === 'merchant' ? '/dashboard/merchant' : '/dashboard/investor'
  const homeTo = `${base}/overview`
  const listTo = `${base}/bridge`
  const breadcrumbs: DashboardBreadcrumbItem[] = [
    { label: 'Dashboard', to: homeTo },
    { label: 'Bridge transactions', to: transferId ? listTo : undefined },
    ...(transferId ? [{ label: 'Details' }] : []),
  ]

  if (transferId && transfer && transfer.purpose === 'repayment' && role === 'investor') {
    return <Navigate to={trackerPathForPurpose('repayment', transfer.id)} replace />
  }
  if (transferId && transfer && transfer.purpose === 'deposit' && role === 'merchant') {
    return <Navigate to={trackerPathForPurpose('deposit', transfer.id)} replace />
  }

  const sorted = sortBridgeTransfersByRecency(transfers)

  return (
    <DashboardLayout
      dashboardBasePath={base}
      topBarBreadcrumbs={breadcrumbs}
      topBarWalletDisplay={role === 'merchant' ? merchantWallet : investorWallet}
    >
      <div className="max-w-[720px] w-full mx-auto pt-4 sm:pt-6 pb-8 flex flex-col gap-5">
        <div>
          <h1 className="text-[#0B1220] font-bold text-[24px] sm:text-[32px] leading-tight">
            {transferId ? 'Bridge' : 'Bridge transactions'}
          </h1>
          <p className="text-[#6B7488] text-[14px] sm:text-[16px] mt-1.5">
            {transferId
              ? 'See whether this Bridge is still waiting, ready to finish, or failed. Use Sign in wallet if it is waiting for your signature.'
              : 'Newest is at the top. Open a row to sign, wait, finish, or see a failed Bridge.'}
          </p>
        </div>

        {transferId ? (
          <>
            <DashboardRequestFeedbackLayer
              phase={loading ? 'loading' : error && !transfer ? 'failed' : 'idle'}
              loadingTitle="Loading Bridge"
              loadingDescription="Getting the latest status…"
              errorTitle="Unable to load Bridge"
              errorDescription={error instanceof Error ? error.message : undefined}
              onDismiss={() => {}}
              onRetry={() => void refetch()}
            />
            {transfer ? <BridgeTransferTracker transfer={transfer} role={role} /> : null}
          </>
        ) : (
          <section className="rounded-[10px] border border-[#D9DEE8] bg-white p-5 flex flex-col gap-3">
            {listLoading ? <p className="text-[#6B7488] text-[14px]">Loading Bridge transactions…</p> : null}
            {!listLoading && sorted.length === 0 ? (
              <p className="text-[#6B7488] text-[14px]">
                No Bridge transactions yet. When you invest or repay from another network, they show
                up here.
              </p>
            ) : null}
            <ul className="flex flex-col gap-2">
              {sorted.map((row, index) => (
                <TransferListRow
                  key={row.id}
                  transfer={row}
                  href={`${base}/bridge/${row.id}`}
                  latest={index === 0}
                />
              ))}
            </ul>
          </section>
        )}
      </div>
    </DashboardLayout>
  )
}

export default BridgeActivityPage
