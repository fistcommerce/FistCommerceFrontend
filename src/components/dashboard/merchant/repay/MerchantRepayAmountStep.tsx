import { useEffect, useMemo, useState, type ReactNode } from 'react'

import arbitrumLogo from '@/assets/arbitrum_icon.jpeg.png'
import { formatInvestAmountUsd } from '@/components/dashboard/investor/invest/config'
import {
  clampMerchantRepayAmount,
  validateMerchantRepayAmount,
} from '@/utils/merchantReceivableRepayEligibility'

interface MerchantRepayAmountStepProps {
  amount: number
  destinationWallet: string
  amountOwedLabel: string
  amountOwedHuman?: number | null
  walletTokenBalanceLabel?: string
  validationError?: string | null
  quickAmounts: readonly number[]
  onAmountSelect: (value: number) => void
  onContinue: () => void
  balancePicker?: ReactNode
}

const MerchantRepayAmountStep = ({
  amount,
  destinationWallet,
  amountOwedLabel,
  amountOwedHuman,
  walletTokenBalanceLabel,
  validationError,
  quickAmounts,
  onAmountSelect,
  onContinue,
  balancePicker,
}: MerchantRepayAmountStepProps) => {
  const [draft, setDraft] = useState(() => (amount > 0 ? String(amount) : ''))

  useEffect(() => {
    setDraft(amount > 0 ? String(amount) : '')
  }, [amount])

  const formattedPreview = useMemo(() => {
    const raw = draft.trim()
    if (!raw) return formatInvestAmountUsd(amount)
    const n = Number(raw.replace(/,/g, ''))
    if (!Number.isFinite(n)) return formatInvestAmountUsd(amount)
    return formatInvestAmountUsd(n)
  }, [amount, draft])

  const handleDraftChange = (nextRaw: string) => {
    const cleaned = nextRaw.replace(/[^\d.,]/g, '')
    setDraft(cleaned)
    const n = Number(cleaned.replace(/,/g, ''))
    if (Number.isFinite(n)) {
      const clamped = clampMerchantRepayAmount(n, amountOwedHuman)
      onAmountSelect(clamped)
    } else {
      onAmountSelect(0)
    }
  }

  const canContinue =
    amount > 0 && !validateMerchantRepayAmount(amount, amountOwedHuman)

  return (
    <section className="rounded-[10px] border border-[#DFE2E8] bg-white p-6">
      {amountOwedLabel !== '—' ? (
        <div className="rounded-[6px] border border-[#195EBC] bg-[#E8EFFB] px-4 py-3 text-left mb-6">
          <p className="text-[#8B92A3] text-[12px]">Amount owed</p>
          <p className="text-[#0B1220] text-[22px] font-bold leading-tight mt-1">{amountOwedLabel}</p>
        </div>
      ) : null}

      <p className="text-[#6B7488] text-[14px] text-center">Amount</p>
      <div className="mt-3 flex flex-col items-center">
        <label className="sr-only" htmlFor="repay-amount">
          Repayment amount
        </label>
        <div className="relative w-full max-w-[420px]">
          <input
            id="repay-amount"
            inputMode="decimal"
            autoComplete="off"
            value={draft}
            onChange={(e) => handleDraftChange(e.target.value)}
            placeholder="0"
            className="w-full bg-transparent text-[#667085] text-[44px] sm:text-[64px] leading-none font-semibold text-center outline-none border-b border-transparent focus:border-[#195EBC] px-10 py-2"
            aria-label="Repayment amount"
          />
          <span className="absolute left-0 top-1/2 -translate-y-1/2 text-[#667085] text-[44px] sm:text-[64px] font-semibold">
            $
          </span>
        </div>
        <p className="text-[#8B92A3] text-[14px] mt-2" aria-live="polite">
          {formattedPreview}
        </p>
      </div>

      <div className="flex justify-center flex-wrap gap-3 mt-5">
        {quickAmounts.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onAmountSelect(v)}
            className={`min-w-[72px] rounded-[4px] px-3 py-2 text-[13px] border ${
              amount === v
                ? 'border-[#195EBC] bg-[#E8EFFB] text-[#195EBC]'
                : 'border-[#E6E8EC] bg-[#F8FAFC] text-[#8B92A3]'
            }`}
          >
            ${v.toLocaleString()}
          </button>
        ))}
      </div>

      {walletTokenBalanceLabel ? (
        <p className="text-center text-[#4D5D80] text-[13px] mt-4 max-w-md mx-auto">{walletTokenBalanceLabel}</p>
      ) : null}

      {balancePicker}

      {validationError ? (
        <p className="text-center text-[#DC2626] text-[13px] mt-3 max-w-md mx-auto" role="alert">
          {validationError}
        </p>
      ) : null}

      <div className="flex justify-center mt-6">
        <div className="flex items-center gap-3">
          <span className="text-[#6B7488] text-[22px]">Wallet:</span>
          <div className="h-[46px] rounded-[6px] border border-[#D9DEE8] bg-white px-4 flex items-center gap-3">
            <span className="text-[#0B1220] text-[19px] font-semibold">{destinationWallet}</span>
            <span className="h-5 w-px bg-[#E6E8EC]" />
            <img src={arbitrumLogo} alt="Arbitrum logo" className="h-5 w-5 rounded-[4px] object-cover" />
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onContinue}
        disabled={!canContinue}
        className="mt-8 w-full rounded-[6px] bg-[#195EBC] text-white text-[18px] font-medium h-[50px] hover:bg-[#154a9a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Continue
      </button>
    </section>
  )
}

export default MerchantRepayAmountStep
