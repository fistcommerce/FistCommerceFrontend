import {
  getContractNetworkLabel,
  getNetworkSessionBadgeLabel,
  isArcTestnetContractNetwork,
  isMainnetContractNetwork,
  isTestnetContractNetwork,
} from '@/contract_config/contractNetwork'
import { useAppSelector } from '@/store/hooks'

/**
 * Persistent badge so users can tell testnet vs mainnet session at a glance.
 * Uses session `auth.chainId` when logged in; falls back to wallet chain.
 */
export default function NetworkSessionBadge() {
  const authChainId = useAppSelector((s) => s.auth.chainId)
  const walletChainId = useAppSelector((s) => s.wallet.chainId)
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const chainId = authChainId ?? (accessToken ? null : walletChainId) ?? walletChainId
  const label = getNetworkSessionBadgeLabel(chainId)
  if (!label || chainId == null) return null

  const isTestnet = isTestnetContractNetwork(chainId) || isArcTestnetContractNetwork(chainId)
  const isMainnet = isMainnetContractNetwork(chainId)
  const title = getContractNetworkLabel(chainId)

  return (
    <div
      className={`flex items-center justify-center gap-2 px-3 py-1.5 text-[12px] font-semibold tracking-wide ${
        isTestnet
          ? 'bg-[#FEF3C7] text-[#92400E] border-b border-[#F59E0B]/40'
          : isMainnet
            ? 'bg-[#ECFDF5] text-[#065F46] border-b border-[#10B981]/30'
            : 'bg-[#F3F4F6] text-[#374151] border-b border-[#E5E7EB]'
      }`}
      role="status"
      aria-label={`Network session: ${title}`}
      title={title}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          isTestnet ? 'bg-[#F59E0B]' : isMainnet ? 'bg-[#10B981]' : 'bg-[#9CA3AF]'
        }`}
        aria-hidden
      />
      <span>
        {label} session — {title}
      </span>
    </div>
  )
}
