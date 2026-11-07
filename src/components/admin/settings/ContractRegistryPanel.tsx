import { useEffect, useMemo, useState } from 'react'

import { fetchProtocolSettingsState } from '@/api/adminProtocolSettings'
import {
  buildContractRegistry,
  type RegistryGroup,
} from '@/components/admin/settings/protocolSettingsDefaults'
import { ReadOnlyBadge, SettingsPanel, shortAddress } from '@/components/admin/settings/SettingsPanel'
import { useIsStellarMode } from '@/hooks/useNetworkCapability'
import { useAppSelector } from '@/store/hooks'

function isContractAddress(value: string): boolean {
  const v = value.trim()
  return v.startsWith('0x') || /^[CG][A-Z0-9]{55}$/i.test(v)
}

const ContractRegistryPanel = () => {
  const isStellar = useIsStellarMode()
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const [apiRegistry, setApiRegistry] = useState<RegistryGroup[] | null>(null)
  const [adminAddress, setAdminAddress] = useState('')

  useEffect(() => {
    if (!isStellar || !accessToken?.trim()) {
      setApiRegistry(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const state = await fetchProtocolSettingsState(accessToken)
        if (cancelled) return
        if (state.admin) setAdminAddress(state.admin)
        if (state.contractRegistry && state.contractRegistry.length > 0) {
          setApiRegistry(state.contractRegistry)
        }
      } catch {
        if (!cancelled) setApiRegistry(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, isStellar])

  const groups = useMemo(() => {
    if (apiRegistry && apiRegistry.length > 0) return apiRegistry
    return buildContractRegistry(isStellar, adminAddress)
  }, [adminAddress, apiRegistry, isStellar])

  return (
    <SettingsPanel
      title="Contract Registry"
      description={
        isStellar
          ? 'Soroban contract IDs from the Stellar Testnet deployment (protocol.json / testnet.deployment.json). These change only on redeploy.'
          : 'Deploy-time wiring and immutable references. These values cannot be changed without redeploying or upgrading contracts.'
      }
      badge={{ label: isStellar ? 'Stellar Testnet' : 'Deploy time', variant: 'neutral' }}
    >
      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <div key={group.contract}>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <h3 className="text-[#0B1220] text-[15px] font-semibold">{group.contract}</h3>
              <ReadOnlyBadge />
            </div>
            <div className="overflow-x-auto rounded-[8px] border border-[#E6E8EC]">
              <table className="min-w-[480px] w-full text-left text-[14px]">
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.label} className="border-t border-[#EEF0F4] first:border-t-0">
                      <th className="px-4 py-3 w-[40%] text-[#6B7488] font-medium align-top">
                        {row.label}
                      </th>
                      <td className="px-4 py-3 font-mono text-[13px] text-[#0B1220] break-all">
                        {isContractAddress(row.value) ? (
                          <span title={row.value}>{shortAddress(row.value)}</span>
                        ) : (
                          row.value
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </SettingsPanel>
  )
}

export default ContractRegistryPanel
