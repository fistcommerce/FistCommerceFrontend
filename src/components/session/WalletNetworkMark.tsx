import arbitrumLogo from '@/assets/arbitrum_icon.jpeg.png'
import { isArcTestnetContractNetwork } from '@/contract_config/contractNetwork'

/** Arbitrum logo on Arb sessions; chain name on Arc (no Arb icon). */
export default function WalletNetworkMark({ chainId }: { chainId?: number | null }) {
  if (isArcTestnetContractNetwork(chainId)) {
    return (
      <span className="text-[12px] font-semibold text-[#4D5D80] shrink-0" title="Arc Testnet">
        Arc
      </span>
    )
  }
  return <img src={arbitrumLogo} alt="" className="h-5 w-5 shrink-0 object-contain" />
}
