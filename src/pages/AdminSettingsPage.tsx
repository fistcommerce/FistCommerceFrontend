import ContractRegistryPanel from '@/components/admin/settings/ContractRegistryPanel'
import FundingPoolPanel from '@/components/admin/settings/FundingPoolPanel'
import MultisigSignersPanel from '@/components/admin/settings/MultisigSignersPanel'
import PayoutRouterPanel from '@/components/admin/settings/PayoutRouterPanel'
import ProtocolConstantsPanel from '@/components/admin/settings/ProtocolConstantsPanel'
import ProtocolSafetyPanel from '@/components/admin/settings/ProtocolSafetyPanel'
import RiskAllocationPanel from '@/components/admin/settings/RiskAllocationPanel'
import { useIsStellarMode } from '@/hooks/useNetworkCapability'

const AdminSettingsPage = () => {
  const isStellar = useIsStellarMode()

  return (
    <div className="w-full max-w-[1280px] mx-auto pb-10 flex flex-col gap-6">
      <div className="rounded-[10px] border border-[#E6E8EC] bg-[#F8FAFC] px-5 py-4">
        <p className="text-[#6B7488] text-[14px]">
          {isStellar
            ? 'Stellar Testnet: FistMultisig is 1-of-1 STELLAR_ADMIN. Pre-handoff admin ops may still use direct STELLAR_ADMIN; after handoff, use governance proposals. Registry and pool wiring panels are read-only.'
            : 'Manage multisig owners and threshold, then other protocol settings via governance proposals. Apply shows a loading state, then sign or review the proposal in the governance flow. Contract Registry and Protocol Constants are read-only reference panels.'}
        </p>
      </div>

      <MultisigSignersPanel />
      {!isStellar ? <ProtocolSafetyPanel /> : null}
      <RiskAllocationPanel />
      <FundingPoolPanel />
      <PayoutRouterPanel />
      <ContractRegistryPanel />
      {!isStellar ? <ProtocolConstantsPanel /> : null}
    </div>
  )
}

export default AdminSettingsPage
