import type { InvestmentReviewRow } from '@/components/dashboard/investor/invest/types'

interface InvestmentConfirmationStepProps {
  /** Formatted USD string (includes `$` and grouping). */
  amountDisplay: string
  warningText: string
  reviewRows: InvestmentReviewRow[]
  isSubmitting?: boolean
  submitDisabled?: boolean
  submitLabel?: string
  onInvest: () => void | Promise<void>
}

const valueToneClass = (tone?: InvestmentReviewRow['valueTone']) => {
  if (tone === 'positive') return 'text-[#16A34A]'
  return 'text-[#0B1220]'
}

const InvestmentConfirmationStep = ({
  amountDisplay,
  warningText,
  reviewRows,
  isSubmitting = false,
  submitDisabled = false,
  submitLabel,
  onInvest,
}: InvestmentConfirmationStepProps) => {
  return (
    <>
      <section className="rounded-[10px] border border-[#D9DEE8] bg-white p-5 sm:p-6">
        <h2 className="text-[#0B1220] font-bold text-[26px] leading-tight">Investment Confirmation</h2>
        <p className="text-[#6B7488] text-[14px] mt-1.5">Review and confirm your investment details</p>

        <div className="mt-5 rounded-[10px] border border-[#E6E8EC] bg-[#F8FAFC] px-5 py-6">
          <div className="text-center">
            <p className="text-[#6B7488] text-[12px] uppercase tracking-wide">Total Investment</p>
            <p className="text-[#0B1220] text-[42px] font-semibold leading-tight mt-2">{amountDisplay}</p>
            <p className="text-[#6B7488] text-[14px] mt-1">USDC</p>
          </div>
        </div>
      </section>

      <section className="rounded-[10px] border border-[#D9DEE8] bg-white p-5 sm:p-6">
        <h3 className="text-[#0B1220] font-semibold text-[18px]">Investment Details</h3>
        <div className="mt-4 divide-y divide-[#EDF0F4]">
          {reviewRows.map((item) => (
            <div key={item.label} className="py-3 flex items-center justify-between gap-4">
              <span className="text-[#6B7488] text-[14px]">{item.label}</span>
              <span className={`text-[14px] font-semibold ${valueToneClass(item.valueTone)}`}>{item.value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[10px] border border-[#FCD34D] bg-[#FFFBEB] p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-[#D97706]">⚠</span>
          <p className="text-[#92400E] text-[13px] leading-relaxed">{warningText}</p>
        </div>
      </section>

      <button
        type="button"
        onClick={() => void onInvest()}
        disabled={isSubmitting || submitDisabled}
        className="w-full rounded-[6px] bg-[#195EBC] text-white text-[18px] font-medium h-[50px] hover:bg-[#154a9a] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {submitLabel ?? (isSubmitting ? 'Confirm in wallet…' : 'Invest Funds')}
      </button>
    </>
  )
}

export default InvestmentConfirmationStep
