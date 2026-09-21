import { describe, expect, it } from 'vitest'

import {
  bridgeListStatusLine,
  bridgeStatusLabel,
  buildBridgeSteps,
  compareBridgeTransfersByRecency,
  continuePathForTransfer,
  formatBridgeRelativeTime,
  formatBridgeStartedLine,
  isActionableBridgeStatus,
  isAwaitingMintStatus,
  isFailedBridgeStatus,
  isReadyToContinueStatus,
  sortBridgeTransfersByRecency,
  trackerListPathForPurpose,
  trackerPathForPurpose,
  transferNeedsSignature,
} from '@/bridge/transferStatus'

describe('bridge transfer status helpers', () => {
  it('classifies awaiting mint vs ready to continue', () => {
    expect(isAwaitingMintStatus('burned')).toBe(true)
    expect(isAwaitingMintStatus('attesting')).toBe(true)
    expect(isReadyToContinueStatus('minted')).toBe(true)
    expect(isReadyToContinueStatus('burned')).toBe(false)
  })

  it('labels in-flight minting in plain language', () => {
    expect(bridgeStatusLabel('burned')).toBe('Moving to Arc')
    expect(bridgeStatusLabel('minted', 'deposit')).toBe('Ready to invest')
    expect(bridgeStatusLabel('minted', 'repayment')).toBe('Ready to repay')
  })

  it('builds tracker and continue paths', () => {
    expect(trackerPathForPurpose('deposit', 'abc')).toBe('/dashboard/investor/bridge/abc')
    expect(trackerPathForPurpose('repayment', 'abc')).toBe('/dashboard/merchant/bridge/abc')
    expect(
      continuePathForTransfer({
        purpose: 'deposit',
        loan_request_id: null,
        metadata: { poolSlug: 'fist-commerce-lending-pool' },
      }),
    ).toBe('/dashboard/investor/lending-pool/fist-commerce-lending-pool/invest')
    expect(
      continuePathForTransfer({
        purpose: 'repayment',
        loan_request_id: 'loan-1',
        metadata: {},
      }),
    ).toBe('/dashboard/merchant/receivables/loan-1/repay/confirm')
    expect(trackerListPathForPurpose('deposit')).toBe('/dashboard/investor/bridge')
    expect(trackerListPathForPurpose('repayment')).toBe('/dashboard/merchant/bridge')
  })

  it('marks failed and waiting as actionable and labels them clearly', () => {
    expect(isFailedBridgeStatus('failed')).toBe(true)
    expect(isActionableBridgeStatus('failed')).toBe(true)
    expect(isActionableBridgeStatus('burned')).toBe(true)
    expect(isActionableBridgeStatus('deposited')).toBe(false)
    expect(bridgeListStatusLine('burned')).toBe('Waiting — moving to Arc')
    expect(bridgeListStatusLine('failed')).toBe('Failed — needs attention')
    expect(bridgeListStatusLine('minted', 'deposit')).toBe('Ready to invest')
  })

  it('treats created and burn_pending without a burn hash as needing a signature', () => {
    expect(transferNeedsSignature({ status: 'created' })).toBe(true)
    expect(transferNeedsSignature({ status: 'burn_pending' })).toBe(true)
    expect(
      transferNeedsSignature({
        status: 'burn_pending',
        burn_tx_hash: `0x${'b'.repeat(64)}`,
      }),
    ).toBe(false)
    expect(bridgeListStatusLine({ status: 'created', purpose: 'deposit' })).toBe('Needs your signature')
  })

  it('marks signed vs remaining steps', () => {
    const unsigned = buildBridgeSteps({ status: 'created', purpose: 'deposit' }, 'Arbitrum Sepolia')
    expect(unsigned.map((step) => step.state)).toEqual(['now', 'left', 'left'])
    const moving = buildBridgeSteps(
      { status: 'attesting', purpose: 'deposit', burn_tx_hash: `0x${'b'.repeat(64)}` },
      'Arbitrum Sepolia',
    )
    expect(moving.map((step) => step.state)).toEqual(['done', 'now', 'left'])
    const ready = buildBridgeSteps(
      {
        status: 'minted',
        purpose: 'deposit',
        burn_tx_hash: `0x${'b'.repeat(64)}`,
        mint_tx_hash: `0x${'c'.repeat(64)}`,
      },
      'Arbitrum Sepolia',
    )
    expect(ready.map((step) => step.state)).toEqual(['done', 'done', 'now'])
  })

  it('sorts transfers so the newest started is first', () => {
    const older = { id: 'old', created_at: '2026-09-20T20:00:00.000Z', updated_at: '2026-09-20T20:01:00.000Z' }
    const newer = { id: 'new', created_at: '2026-09-20T22:10:00.000Z', updated_at: '2026-09-20T22:11:00.000Z' }
    expect(compareBridgeTransfersByRecency(older, newer)).toBeGreaterThan(0)
    expect(sortBridgeTransfersByRecency([older, newer]).map((row) => row.id)).toEqual(['new', 'old'])
  })

  it('describes when a transfer started', () => {
    const now = Date.parse('2026-09-20T22:00:00.000Z')
    expect(formatBridgeRelativeTime('2026-09-20T21:57:00.000Z', now)).toBe('3 min ago')
    expect(formatBridgeRelativeTime('2026-09-20T21:00:00.000Z', now)).toBe('1 hr ago')
    expect(
      formatBridgeStartedLine({ created_at: '2026-09-20T21:57:00.000Z' }, now),
    ).toMatch(/^Started 3 min ago · /)
    expect(formatBridgeStartedLine({ created_at: undefined, updated_at: undefined })).toBe(
      'Start time unavailable',
    )
  })
})
