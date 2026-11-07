import { useEffect, useState } from 'react'

import {
  PREFERRED_NETWORK_EVENT,
  type PreferredNetwork,
  readPreferredAppNetwork,
} from '@/contract_config/networkCapabilities'

/** Reactive preferred network (Testnet / Mainnet / Stellar Testnet). */
export function usePreferredAppNetwork(): PreferredNetwork {
  const [preferred, setPreferred] = useState<PreferredNetwork>(() => readPreferredAppNetwork())

  useEffect(() => {
    const sync = () => setPreferred(readPreferredAppNetwork())
    const onCustom = () => sync()
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'fistcommerce.preferredNetwork') sync()
    }
    window.addEventListener(PREFERRED_NETWORK_EVENT, onCustom)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(PREFERRED_NETWORK_EVENT, onCustom)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  return preferred
}

export function useIsStellarTestnetMode(): boolean {
  return usePreferredAppNetwork() === 'stellar-testnet'
}
