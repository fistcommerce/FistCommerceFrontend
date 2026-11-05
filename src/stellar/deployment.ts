/**
 * Loads Fist Commerce Soroban deployment manifest (synced from FistCommerceStellar).
 */
import deployment from './testnet.deployment.json'

export type SorobanDeployment = {
  project: string
  network: string
  network_passphrase: string
  attestation_registry: { contract_id: string }
  trade_credit_pool: { contract_id: string }
  test_asset: { code: string; issuer: string; sac_contract_id: string }
  subgraph_url?: string
  track_b?: Record<string, string>
}

export function getSorobanDeployment(): SorobanDeployment {
  return deployment as SorobanDeployment
}

export function getSorobanSubgraphUrl(): string {
  return (
    (import.meta.env.VITE_SOROBAN_SUBGRAPH_URL as string | undefined)?.trim() ||
    getSorobanDeployment().subgraph_url ||
    'http://localhost:4000/graphql'
  )
}
