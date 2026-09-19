import type { BridgeConfig, BridgeEligibleBalance } from '@/api/bridge'
import { isWalletSwitchChainId } from '@/bridge/cctpSourceChains'
import { isCircleSupportedChainId } from '@/circle/chainMap'
import { ARC_TESTNET_CHAIN_ID } from '@/contract_config/contractNetwork'

/** Chain ids allowed as CCTP sources or Arc destination for funding. */
export function acceptedChainIdSet(config: BridgeConfig): Set<number> {
  const ids = new Set<number>()
  if (Number.isFinite(config.destination?.chainId)) {
    ids.add(config.destination.chainId)
  } else {
    ids.add(ARC_TESTNET_CHAIN_ID)
  }
  for (const s of config.sources ?? []) {
    if (Number.isFinite(s.chainId)) ids.add(s.chainId)
  }
  return ids
}

export function filterBalancesToAccepted(
  balances: BridgeEligibleBalance[],
  config: BridgeConfig | null | undefined,
): BridgeEligibleBalance[] {
  if (!config) {
    return balances.filter((b) => !b.requiresBridge || isWalletSwitchChainId(b.chainId))
  }
  const allowed = acceptedChainIdSet(config)
  return balances.filter((b) => {
    if (!allowed.has(b.chainId)) return false
    // CCTP burn requires a wallet-switchable chain definition in this app.
    if (b.requiresBridge && !isWalletSwitchChainId(b.chainId)) return false
    return true
  })
}

/**
 * Circle can only hop to Circle-supported chains. Keep Arc + those CCTP sources;
 * do not hide all requiresBridge rows (funding hop allows Circle CCTP).
 */
export function filterBalancesForCircleWallet(
  balances: BridgeEligibleBalance[],
  isCircleWallet: boolean,
): BridgeEligibleBalance[] {
  if (!isCircleWallet) return balances
  return balances.filter((b) => {
    if (!b.requiresBridge) return true
    return isCircleSupportedChainId(b.chainId)
  })
}

/** @deprecated Use {@link filterBalancesForCircleWallet}. */
export function filterBalancesForCircleSession(
  balances: BridgeEligibleBalance[],
  circleSessionLocked: boolean,
): BridgeEligibleBalance[] {
  // Legacy "locked" meant Arc-only; unlocked means no filter.
  // New behavior: when "locked" flag is true we still show Circle-supported CCTP sources.
  if (!circleSessionLocked) return balances
  return filterBalancesForCircleWallet(balances, true)
}

export function isAcceptedBridgeSelection(
  selected: Pick<BridgeEligibleBalance, 'chainId' | 'bridgeKitId' | 'requiresBridge'>,
  config: BridgeConfig,
): boolean {
  const allowed = acceptedChainIdSet(config)
  if (!allowed.has(selected.chainId)) return false
  if (!selected.requiresBridge) {
    return selected.chainId === config.destination.chainId
  }
  if (!isWalletSwitchChainId(selected.chainId)) return false
  const source = (config.sources ?? []).find((s) => s.chainId === selected.chainId)
  if (!source) return false
  if (selected.bridgeKitId && source.bridgeKitId && selected.bridgeKitId !== source.bridgeKitId) {
    return false
  }
  return Boolean(selected.bridgeKitId || source.bridgeKitId)
}

export function assertAcceptedBridgeSelection(
  selected: Pick<BridgeEligibleBalance, 'chainId' | 'bridgeKitId' | 'requiresBridge' | 'label'>,
  config: BridgeConfig,
): void {
  if (!isAcceptedBridgeSelection(selected, config)) {
    throw new Error(
      `USDC on ${selected.label || `chain ${selected.chainId}`} is not an accepted funding source.`,
    )
  }
}
