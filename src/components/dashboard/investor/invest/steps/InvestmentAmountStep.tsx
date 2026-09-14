import arbitrumLogo from '@/assets/arbitrum_icon.jpeg.png'
import { formatInvestAmountUsd } from '@/components/dashboard/investor/invest/config'
import InvestorBalanceSummaryBoxes from '@/components/dashboard/investor/shared/InvestorBalanceSummaryBoxes'
import InvestorFlowContinueButton from '@/components/dashboard/investor/shared/InvestorFlowContinueButton'
import { resolveInvestFlowContinueHint } from '@/utils/investorFlowAmountLimits'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

interface InvestmentAmountStepProps {
  amount: number
  walletDisplay: string
  walletBalanceDisplay: string
  investmentBalanceDisplay: string
  maxAmountHuman?: number | null
  validationError?: string | null
  quickAmounts: readonly number[]
  onAmountSelect: (value: number) => void
  onContinue: () => void
  /** Optional multi-chain USDC picker (CCTP / Arc). */
  balancePicker?: ReactNode
}

const InvestmentAmountStep = ({
  amount,
  walletDisplay,
  walletBalanceDisplay,
  investmentBalanceDisplay,
  maxAmountHuman,
  validationError,
  quickAmounts,
  onAmountSelect,
  onContinue,
  balancePicker,
}: InvestmentAmountStepProps) => {
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
      onAmountSelect(n)
    } else {
      onAmountSelect(0)
    }
  }

  const canContinue = amount > 0 && !validationError
  const continueDisabledHint = useMemo(
    () => resolveInvestFlowContinueHint(amount, maxAmountHuman, validationError),
    [amount, maxAmountHuman, validationError],
  )

  return (
    <>
      <section className="rounded-[10px] border border-[#D9DEE8] bg-white p-4 sm:p-6">
        <h2 className="text-[#6B7488] font-medium text-[16px] sm:text-[20px] mb-3 sm:mb-4">Invest Funds</h2>
        <InvestorBalanceSummaryBoxes
          walletBalanceDisplay={walletBalanceDisplay}
          investmentBalanceDisplay={investmentBalanceDisplay}
        />
      </section>

      <section className="rounded-[10px] border border-[#D9DEE8] bg-white px-5 py-8 sm:px-6 sm:py-10">
        <p className="text-[#6B7488] text-[30px] text-center">Amount</p>
        <div className="mt-4 flex flex-col items-center">
          <label className="sr-only" htmlFor="invest-amount">
            Investment amount
          </label>
          <div className="relative w-full max-w-[420px]">
            <input
              id="invest-amount"
              inputMode="decimal"
              autoComplete="off"
              value={draft}
              onChange={(e) => handleDraftChange(e.target.value)}
              placeholder="0"
              className="w-full bg-transparent text-[#667085] text-[44px] sm:text-[64px] leading-none font-semibold text-center outline-none border-b border-transparent focus:border-[#195EBC] px-10 py-2"
              aria-label="Investment amount"
            />
            <span className="absolute left-0 top-1/2 -translate-y-1/2 text-[#667085] text-[44px] sm:text-[64px] font-semibold">
              $
            </span>
          </div>
          <p className="text-[#8B92A3] text-[14px] mt-2" aria-live="polite">
            {formattedPreview}
          </p>
          {validationError ? (
            <p className="text-[#DC2626] text-[13px] mt-2 max-w-md text-center">{validationError}</p>
          ) : null}
        </div>

        <div className="flex justify-center flex-wrap gap-3 mt-8">
          {quickAmounts.map((v) => {
            const overMax =
              maxAmountHuman != null && Number.isFinite(maxAmountHuman) && maxAmountHuman > 0 && v > maxAmountHuman
            return (
            <button
              key={v}
              type="button"
              onClick={() => onAmountSelect(v)}
              disabled={overMax}
              className={`min-w-[90px] rounded-[4px] px-3 py-2 text-[13px] border ${
                amount === v ? 'border-[#195EBC] bg-[#E8EFFB] text-[#195EBC]' : 'border-[#E6E8EC] bg-[#F8FAFC] text-[#8B92A3]'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              ${v.toLocaleString()}
            </button>
            )
          })}
        </div>

        <div className="flex justify-center mt-10">
          <div className="flex items-center gap-3">
            <span className="text-[#6B7488] text-[22px]">Wallet:</span>
            <div className="h-[46px] rounded-[6px] border border-[#D9DEE8] bg-white px-4 flex items-center gap-3">
              <span className="text-[#0B1220] text-[19px] font-semibold">{walletDisplay}</span>
              <span className="h-5 w-px bg-[#E6E8EC]" />
              <img src={arbitrumLogo} alt="Arbitrum logo" className="h-5 w-5 rounded-[4px] object-cover" />
            </div>
          </div>
        </div>

        {balancePicker}

        <InvestorFlowContinueButton
          onClick={onContinue}
          disabled={!canContinue}
          disabledHint={continueDisabledHint}
          className="mt-10"
        />
      </section>
    </>
  )
}

export default InvestmentAmountStep
