import type { BridgePurpose, BridgeTransfer } from '@/api/bridge'

export const BRIDGE_IN_FLIGHT_STATUSES = [
  'created',
  'burn_pending',
  'burned',
  'attesting',
  'minting',
  'minted',
  'deposit_pending',
  'repay_pending',
] as const

export const BRIDGE_AWAITING_MINT_STATUSES = [
  'created',
  'burn_pending',
  'burned',
  'attesting',
  'minting',
] as const

export const BRIDGE_READY_TO_CONTINUE_STATUSES = ['minted', 'deposit_pending', 'repay_pending'] as const

export const BRIDGE_TERMINAL_STATUSES = ['deposited', 'repaid', 'failed'] as const

export type BridgeTransferStatus = BridgeTransfer['status']

export function isAwaitingMintStatus(status: string | null | undefined): boolean {
  return BRIDGE_AWAITING_MINT_STATUSES.includes(
    String(status ?? '') as (typeof BRIDGE_AWAITING_MINT_STATUSES)[number],
  )
}

export function isReadyToContinueStatus(status: string | null | undefined): boolean {
  return BRIDGE_READY_TO_CONTINUE_STATUSES.includes(
    String(status ?? '') as (typeof BRIDGE_READY_TO_CONTINUE_STATUSES)[number],
  )
}

export function isInFlightBridgeStatus(status: string | null | undefined): boolean {
  return BRIDGE_IN_FLIGHT_STATUSES.includes(
    String(status ?? '') as (typeof BRIDGE_IN_FLIGHT_STATUSES)[number],
  )
}

export function isFailedBridgeStatus(status: string | null | undefined): boolean {
  return String(status ?? '') === 'failed'
}

export function isActionableBridgeStatus(status: string | null | undefined): boolean {
  return (
    isAwaitingMintStatus(status) || isReadyToContinueStatus(status) || isFailedBridgeStatus(status)
  )
}

export type BridgeStatusTone = 'waiting' | 'ready' | 'failed' | 'done'

export function bridgeStatusTone(status: string | null | undefined): BridgeStatusTone {
  if (isFailedBridgeStatus(status)) return 'failed'
  if (isReadyToContinueStatus(status)) return 'ready'
  if (isAwaitingMintStatus(status)) return 'waiting'
  return 'done'
}

export function bridgeListStatusLine(
  transferOrStatus: string | Pick<BridgeTransfer, 'status' | 'purpose' | 'burn_tx_hash'>,
  purpose?: BridgePurpose,
): string {
  const transfer =
    typeof transferOrStatus === 'string'
      ? { status: transferOrStatus, purpose, burn_tx_hash: undefined }
      : transferOrStatus
  if (transferNeedsSignature(transfer)) return 'Needs your signature'
  const tone = bridgeStatusTone(transfer.status)
  if (tone === 'failed') return 'Failed — needs attention'
  if (tone === 'waiting') return 'Waiting — moving to Arc'
  return bridgeStatusLabel(transfer.status, transfer.purpose ?? purpose)
}

export function bridgeStartedAtMs(
  transfer: Pick<BridgeTransfer, 'created_at' | 'updated_at'>,
): number {
  const raw = transfer.created_at || transfer.updated_at || ''
  const t = Date.parse(raw)
  return Number.isFinite(t) ? t : 0
}

export function compareBridgeTransfersByRecency(
  a: Pick<BridgeTransfer, 'created_at' | 'updated_at' | 'id'>,
  b: Pick<BridgeTransfer, 'created_at' | 'updated_at' | 'id'>,
): number {
  const diff = bridgeStartedAtMs(b) - bridgeStartedAtMs(a)
  if (diff !== 0) return diff
  return String(b.id).localeCompare(String(a.id))
}

export function sortBridgeTransfersByRecency<T extends Pick<BridgeTransfer, 'created_at' | 'updated_at' | 'id'>>(
  transfers: T[],
): T[] {
  return [...transfers].sort(compareBridgeTransfersByRecency)
}

export function formatBridgeRelativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso?.trim()) return ''
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const diffMs = Math.max(0, now - t)
  const sec = Math.round(diffMs / 1000)
  if (sec < 45) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return hr === 1 ? '1 hr ago' : `${hr} hrs ago`
  const day = Math.round(hr / 24)
  if (day < 7) return day === 1 ? '1 day ago' : `${day} days ago`
  return formatBridgeStartedAt(iso)
}

export function formatBridgeStartedAt(iso: string | null | undefined): string {
  if (!iso?.trim()) return ''
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  return new Date(t).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatBridgeStartedLine(
  transfer: Pick<BridgeTransfer, 'created_at' | 'updated_at'>,
  now = Date.now(),
): string {
  const iso = transfer.created_at || transfer.updated_at
  if (!iso) return 'Start time unavailable'
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 'Start time unavailable'
  const relative = formatBridgeRelativeTime(iso, now)
  const absolute = formatBridgeStartedAt(iso)
  const ageDays = (now - t) / 86_400_000
  if (!relative) return `Started ${absolute || 'at an unknown time'}`
  if (ageDays >= 7 || relative === absolute) return `Started ${relative}`
  return `Started ${relative} · ${absolute}`
}

export function hasBurnTx(transfer: Pick<BridgeTransfer, 'burn_tx_hash'>): boolean {
  return Boolean(transfer.burn_tx_hash?.trim())
}

export function transferNeedsSignature(
  transfer: Pick<BridgeTransfer, 'status' | 'burn_tx_hash'>,
): boolean {
  if (hasBurnTx(transfer)) return false
  const status = String(transfer.status ?? '')
  return status === 'created' || status === 'burn_pending'
}

export function bridgeSignLabel(): string {
  return 'Sign in wallet'
}

export type BridgeStepState = 'done' | 'now' | 'left' | 'failed'

export type BridgeStep = {
  id: 'sign' | 'arrive' | 'finish'
  title: string
  detail: string
  state: BridgeStepState
}

export function buildBridgeSteps(
  transfer: Pick<BridgeTransfer, 'status' | 'purpose' | 'burn_tx_hash' | 'mint_tx_hash'>,
  sourceLabel: string,
): BridgeStep[] {
  const status = String(transfer.status ?? '')
  const failed = status === 'failed'
  const signed = hasBurnTx(transfer) || !['created', 'burn_pending', ''].includes(status)
  const arrived =
    Boolean(transfer.mint_tx_hash?.trim()) ||
    ['minted', 'deposit_pending', 'repay_pending', 'deposited', 'repaid'].includes(status)
  const finished = status === 'deposited' || status === 'repaid'
  const finishTitle = transfer.purpose === 'repayment' ? 'Finish repayment' : 'Finish investment'
  const finishDone = transfer.purpose === 'repayment' ? 'Repayment submitted' : 'Invested in the pool'

  const signState: BridgeStepState = signed ? 'done' : failed ? 'failed' : 'now'
  const arriveState: BridgeStepState = arrived
    ? 'done'
    : !signed
      ? 'left'
      : failed
        ? 'failed'
        : 'now'
  const finishState: BridgeStepState = finished
    ? 'done'
    : !arrived
      ? 'left'
      : failed
        ? 'failed'
        : 'now'

  return [
    {
      id: 'sign',
      title: `Sign on ${sourceLabel}`,
      detail:
        signState === 'done'
          ? 'Confirmed in your wallet'
          : signState === 'failed'
            ? 'Signature did not complete'
            : 'Use Sign in wallet, then confirm the popup',
      state: signState,
    },
    {
      id: 'arrive',
      title: 'USDC arrives on Arc',
      detail:
        arriveState === 'done'
          ? 'USDC is on Arc'
          : arriveState === 'now'
            ? 'Usually about a minute — you can leave'
            : arriveState === 'failed'
              ? 'Did not arrive on Arc'
              : 'Starts after you sign',
      state: arriveState,
    },
    {
      id: 'finish',
      title: finishTitle,
      detail:
        finishState === 'done'
          ? finishDone
          : finishState === 'now'
            ? 'Confirm once more in your wallet'
            : finishState === 'failed'
              ? 'Could not finish this last step'
              : 'After USDC arrives on Arc',
      state: finishState,
    },
  ]
}

export function bridgeStepProgress(steps: BridgeStep[]): {
  done: number
  total: number
  left: number
  nowTitle: string | null
} {
  const done = steps.filter((step) => step.state === 'done').length
  const now = steps.find((step) => step.state === 'now' || step.state === 'failed')
  return {
    done,
    total: steps.length,
    left: Math.max(0, steps.length - done),
    nowTitle: now?.title ?? null,
  }
}

export function bridgeStatusLabel(status: string | null | undefined, purpose?: BridgePurpose): string {
  switch (String(status ?? '')) {
    case 'created':
    case 'burn_pending':
      return 'Waiting for your signature'
    case 'burned':
    case 'attesting':
      return 'Moving to Arc'
    case 'minting':
      return 'Almost there'
    case 'minted':
      return purpose === 'repayment' ? 'Ready to repay' : 'Ready to invest'
    case 'deposit_pending':
      return 'Finishing investment'
    case 'repay_pending':
      return 'Finishing repayment'
    case 'deposited':
      return 'Invested'
    case 'repaid':
      return 'Repaid'
    case 'failed':
      return 'Needs attention'
    default:
      return 'In progress'
  }
}

export function bridgeStatusDescription(
  transfer: Pick<BridgeTransfer, 'status' | 'purpose' | 'bridge_kit_source' | 'burn_tx_hash'>,
): string {
  const source = transfer.bridge_kit_source?.replace(/_/g, ' ') || 'another network'
  if (transferNeedsSignature(transfer)) {
    return `Use Sign in wallet. Confirm in your wallet on ${source} to start moving USDC to Arc.`
  }
  if (isAwaitingMintStatus(transfer.status)) {
    return `Your USDC is moving from ${source} to Arc. This usually takes about a minute — you can leave and come back.`
  }
  if (isReadyToContinueStatus(transfer.status)) {
    return transfer.purpose === 'repayment'
      ? 'Your USDC is on Arc. Confirm in your wallet to finish the repayment.'
      : 'Your USDC is on Arc. Confirm in your wallet to finish investing.'
  }
  if (transfer.status === 'deposited') {
    return 'This USDC is now in the lending pool.'
  }
  if (transfer.status === 'repaid') {
    return 'This repayment has been submitted.'
  }
  if (transfer.status === 'failed') {
    return 'This Bridge did not finish. Do not send the same amount again until this one is resolved.'
  }
  return 'Your USDC Bridge is updating.'
}

export function bridgeContinueLabel(purpose?: BridgePurpose): string {
  return purpose === 'repayment' ? 'Finish repayment' : 'Finish investment'
}

export function bridgeWaitingHint(): string {
  return 'Usually about a minute. You can close this tab — we will keep working.'
}

export function parseBridgeAmountHuman(raw: string | null | undefined): number {
  const n = Number(String(raw ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function defaultInvestPoolSlug(metadata?: Record<string, unknown> | null): string {
  const slug = metadata?.poolSlug
  return typeof slug === 'string' && slug.trim() ? slug.trim() : 'fist-commerce-lending-pool'
}

export function continuePathForTransfer(
  transfer: Pick<BridgeTransfer, 'purpose' | 'loan_request_id' | 'metadata'>,
): string {
  if (transfer.purpose === 'repayment' && transfer.loan_request_id) {
    return `/dashboard/merchant/receivables/${transfer.loan_request_id}/repay/confirm`
  }
  const poolSlug = defaultInvestPoolSlug(transfer.metadata)
  return `/dashboard/investor/lending-pool/${poolSlug}/invest`
}

export function trackerListPathForPurpose(purpose: BridgePurpose | undefined): string {
  if (purpose === 'repayment') return '/dashboard/merchant/bridge'
  return '/dashboard/investor/bridge'
}

export function trackerPathForPurpose(purpose: BridgePurpose | undefined, transferId: string): string {
  return `${trackerListPathForPurpose(purpose)}/${transferId}`
}
