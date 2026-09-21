import type { BridgeEligibleBalance } from '@/api/bridge'

type UsdcBalancePickerProps = {
  balances: BridgeEligibleBalance[]
  selectedChainId: number | null
  onSelect: (chainId: number) => void
  loading?: boolean
  error?: string | null
  amountHuman?: number
  /** @deprecated CCTP is allowed under funding hops; kept for call-site compat. */
  circleSessionLocked?: boolean
  /** Circle uses a different address per chain — balances may need multi-SCA API support. */
  circleMultiAddressHint?: boolean
}

function formatBal(b: BridgeEligibleBalance): string {
  if (b.error) return 'Unavailable'
  if (b.balance == null) return '—'
  const n = Number(b.balance)
  if (!Number.isFinite(n)) return b.balance
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 6 })} USDC`
}

export default function UsdcBalancePicker({
  balances,
  selectedChainId,
  onSelect,
  loading,
  error,
  amountHuman,
  circleMultiAddressHint,
}: UsdcBalancePickerProps) {
  return (
    <div className="mt-6 w-full max-w-[520px] mx-auto text-left">
      <p className="text-[#6B7488] text-[13px] font-medium mb-2">Pay with USDC from</p>
      {circleMultiAddressHint ? (
        <p className="text-[#6B7488] text-[12px] mb-2">
          We may switch networks so you can sign. After that you can leave while USDC moves to Arc.
        </p>
      ) : null}
      {loading ? (
        <p className="text-[#8B92A3] text-[13px]">Loading balances…</p>
      ) : null}
      {error ? <p className="text-[#DC2626] text-[13px] mb-2">{error}</p> : null}
      <ul className="flex flex-col gap-2">
        {balances.map((b) => {
          const selected = b.chainId === selectedChainId
          const insufficient =
            amountHuman != null &&
            amountHuman > 0 &&
            b.sufficient === false &&
            b.balance != null
          return (
            <li key={b.chainId}>
              <button
                type="button"
                onClick={() => onSelect(b.chainId)}
                disabled={Boolean(b.error)}
                className={`w-full rounded-[6px] border px-4 py-3 text-left transition-colors ${
                  selected
                    ? 'border-[#195EBC] bg-[#E8EFFB]'
                    : 'border-[#E6E8EC] bg-[#F8FAFC] hover:border-[#195EBC]/40'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[#0B1220] text-[14px] font-medium">{b.label}</p>
                    <p className="text-[#8B92A3] text-[12px] mt-0.5">
                      {b.requiresBridge
                        ? 'We’ll move this to Arc first (about a minute)'
                        : 'Use this balance now'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[#0B1220] text-[13px] font-semibold">{formatBal(b)}</p>
                    {insufficient ? (
                      <p className="text-[#DC2626] text-[11px] mt-0.5">Insufficient for amount</p>
                    ) : b.sufficient ? (
                      <p className="text-[#059669] text-[11px] mt-0.5">Sufficient</p>
                    ) : null}
                  </div>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
      {!loading && balances.length === 0 && !error ? (
        <p className="text-[#8B92A3] text-[13px]">No eligible USDC balances found.</p>
      ) : null}
    </div>
  )
}
