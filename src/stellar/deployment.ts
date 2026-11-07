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
  track_b?: Record<string, string>
}

export function getSorobanDeployment(): SorobanDeployment {
  return deployment as SorobanDeployment
}
