import { getSorobanDeployment, getSorobanSubgraphUrl } from '@/stellar/deployment'
import { useIsSorobanMode } from '@/hooks/useNetworkCapability'

/**
 * Minimal Soroban capability surface for Track A demo reads.
 * Full Freighter signing wires through the stellar demo client / later wallet adapter.
 */
export default function SorobanDemoPanel() {
  const active = useIsSorobanMode()
  if (!active) return null
  const dep = getSorobanDeployment()
  return (
    <section className="mx-auto max-w-3xl space-y-3 px-4 py-6">
      <h1 className="text-xl font-semibold text-[#0F1C3F]">Stellar Trade Credit (demo)</h1>
      <p className="text-sm text-[#4D5D80]">
        Settlement asset: <strong>{dep.test_asset.code}</strong> (test SAC — not USDC). Pool:{' '}
        <code className="text-xs">{dep.trade_credit_pool.contract_id}</code>
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-[#0F1C3F]">
        <li>Investor allowlist + deposit</li>
        <li>Register / approve receivable</li>
        <li>Dual attestation gate before fund</li>
        <li>Partial + final repay → Settled</li>
        <li>Indexed history: {getSorobanSubgraphUrl()}</li>
      </ul>
      <p className="text-xs text-[#6B7280]">
        Use the TypeScript demo client in FistCommerceStellar/client/typescript for signed invokes until
        Freighter wallet adapter is connected in this UI.
      </p>
    </section>
  )
}
