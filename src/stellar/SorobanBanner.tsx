import { isSorobanTestnetPreferred } from '@/contract_config/networkCapabilities'

/** Limited-prototype banner when Soroban Testnet is selected. */
export default function SorobanBanner() {
  if (!isSorobanTestnetPreferred()) return null
  return (
    <div
      role="status"
      className="w-full border-b border-amber-700/40 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950"
    >
      Soroban Testnet — Fist Commerce limited trade-credit prototype (FISTUSD test asset, not USDC).
      Only features backed by deployed Soroban contracts are available.
    </div>
  )
}
