import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import type { BridgePurpose } from '@/api/bridge'
import {
  isActionableBridgeStatus,
  isFailedBridgeStatus,
  isReadyToContinueStatus,
  trackerListPathForPurpose,
} from '@/bridge/transferStatus'
import { useActiveBridgeTransfers } from '@/hooks/useActiveBridgeTransfers'

const DISMISS_KEY = 'fist:bridge-notice-dismissed-sig'

function readDismissedSig(): string {
  try {
    return sessionStorage.getItem(DISMISS_KEY) ?? ''
  } catch {
    return ''
  }
}

function writeDismissedSig(sig: string): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, sig)
  } catch {
    /* ignore quota / private mode */
  }
}

function actionableSignature(idsAndTones: string[]): string {
  return [...idsAndTones].sort().join('|')
}

/** One-line dashboard notice. Opens the Bridge list, never a single bridge. */
export default function BridgeStatusNotice() {
  const { pathname } = useLocation()
  const isMerchant = pathname.startsWith('/dashboard/merchant')
  const isInvestor = pathname.startsWith('/dashboard/investor')
  const onBridgePage = /\/dashboard\/(investor|merchant)\/bridge(?:\/|$)/.test(pathname)
  const purpose: BridgePurpose = isMerchant ? 'repayment' : 'deposit'
  const enabled = (isMerchant || isInvestor) && !onBridgePage
  const { transfers } = useActiveBridgeTransfers({ purpose, enabled })
  const [dismissedSig, setDismissedSig] = useState(readDismissedSig)

  const actionable = useMemo(
    () => transfers.filter((row) => isActionableBridgeStatus(row.status)),
    [transfers],
  )
  const signature = useMemo(
    () => actionableSignature(actionable.map((row) => `${row.id}:${row.status}`)),
    [actionable],
  )

  if (!enabled || actionable.length === 0 || signature === dismissedSig) return null

  const listHref = trackerListPathForPurpose(purpose)
  const failed = actionable.filter((row) => isFailedBridgeStatus(row.status)).length
  const ready = actionable.filter((row) => isReadyToContinueStatus(row.status)).length
  const waiting = actionable.length - failed - ready
  const amount = actionable[0]?.amount_human?.trim()

  let message = 'A USDC Bridge is in progress'
  if (failed && actionable.length === 1) {
    message = 'A USDC Bridge failed and needs attention'
  } else if (failed) {
    message = `${failed} on Bridge need attention`
  } else if (ready && waiting) {
    message = `${ready} ready to finish · ${waiting} still moving to Arc`
  } else if (ready) {
    message =
      ready === 1 && amount
        ? `${amount} USDC arrived on Arc`
        : `${ready} on Bridge ready to finish`
  } else if (waiting === 1 && amount) {
    message = `Moving ${amount} USDC to Arc`
  } else if (waiting > 1) {
    message = `${waiting} on Bridge moving to Arc`
  }

  const dismiss = () => {
    writeDismissedSig(signature)
    setDismissedSig(signature)
  }

  return (
    <div className="px-4 lg:px-6 py-2 bg-[#F8FAFC] border-b border-[#E6E8EC] flex items-center gap-3">
      <p className="min-w-0 flex-1 text-[#4B5563] text-[13px] truncate">{message}</p>
      <Link
        to={listHref}
        className={`shrink-0 h-7 px-3 rounded-[6px] text-[12px] font-medium inline-flex items-center ${
          failed || ready
            ? 'bg-[#195EBC] text-white hover:bg-[#154a9a]'
            : 'bg-[#E8EFFB] text-[#195EBC] hover:bg-[#D9E6F8]'
        }`}
      >
        View Bridge transactions
      </Link>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 h-7 w-7 rounded-sm text-[#6B7488] hover:bg-[#EEF2F6] text-[16px] leading-none"
        aria-label="Dismiss Bridge notice"
      >
        ×
      </button>
    </div>
  )
}
