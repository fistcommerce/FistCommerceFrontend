import { arbitrum, arbitrumSepolia } from 'viem/chains'
import { defineChain, type Chain } from 'viem'

import localConfig from '@/contract_config/local-deployment-config.json'
import {
  ARC_TESTNET_CHAIN_ID,
  getContractNetworkMode,
  isLocalOnlyDeployMode,
} from '@/contract_config/contractNetwork'

type LocalChainConfig = {
  chainId: number
  chainName: string
  rpcUrl: string
  blockExplorerUrl?: string
}

const local = localConfig as LocalChainConfig

function readEnvTrim(key: string): string {
  const raw = (import.meta.env as Record<string, string | undefined>)[key]?.trim()
  return raw ?? ''
}

function resolveLocalChainId(): number {
  const fromEnv = readEnvTrim('VITE_LOCAL_CHAIN_ID')
  if (fromEnv) {
    const n = Number(fromEnv)
    if (Number.isFinite(n) && n > 0) return Math.trunc(n)
  }
  return local.chainId
}

function resolveLocalRpcUrl(): string {
  return readEnvTrim('VITE_LOCAL_RPC_URL') || local.rpcUrl || 'http://127.0.0.1:8545'
}

function resolveLocalExplorerUrl(): string | undefined {
  const fromEnv = readEnvTrim('VITE_LOCAL_BLOCK_EXPLORER_URL')
  const fromJson = local.blockExplorerUrl?.trim()
  const url = fromEnv || fromJson
  return url || undefined
}

function resolveMainnetRpcUrl(): string {
  return readEnvTrim('VITE_MAINNET_RPC_URL') || arbitrum.rpcUrls.default.http[0]
}

function resolveArcTestnetRpcUrl(): string {
  return readEnvTrim('VITE_ARC_TESTNET_RPC_URL') || 'https://rpc.testnet.arc.io'
}

function resolveArcTestnetExplorerUrl(): string {
  return readEnvTrim('VITE_ARC_TESTNET_BLOCK_EXPLORER_URL') || 'https://testnet.arcscan.app'
}

/** Anvil / Hardhat — used when `VITE_CONTRACT_NETWORK=local`. */
export const LOCAL_CHAIN: Chain = defineChain({
  id: resolveLocalChainId(),
  name: local.chainName || 'Anvil Local',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [resolveLocalRpcUrl()] },
  },
  ...(resolveLocalExplorerUrl()
    ? { blockExplorers: { default: { name: 'Explorer', url: resolveLocalExplorerUrl()! } } }
    : {}),
})

/** Arbitrum Sepolia testnet. */
export const TESTNET_CHAIN = arbitrumSepolia

/** Arbitrum One — RPC overridable via `VITE_MAINNET_RPC_URL`. */
export const MAINNET_CHAIN: Chain = defineChain({
  ...arbitrum,
  rpcUrls: {
    ...arbitrum.rpcUrls,
    default: { http: [resolveMainnetRpcUrl()] },
  },
})

/** Arc Testnet — native USDC gas; pool token is Fist MockERC20. */
export const ARC_TESTNET_CHAIN: Chain = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: [resolveArcTestnetRpcUrl()] },
  },
  blockExplorers: {
    default: { name: 'Arcscan', url: resolveArcTestnetExplorerUrl() },
  },
})

/**
 * Privy / wrong-network default when no wallet chain is set.
 * Follows `VITE_CONTRACT_NETWORK` so mainnet deploys default to Arbitrum One.
 */
export const DEFAULT_APP_CHAIN: Chain = (() => {
  if (isLocalOnlyDeployMode()) return LOCAL_CHAIN
  if (getContractNetworkMode() === 'mainnet') return MAINNET_CHAIN
  return TESTNET_CHAIN
})()

/**
 * Chains the product allows for login + contracts.
 * Local-only mode: Anvil only. Otherwise: Arbitrum One, Sepolia, then Arc Testnet.
 */
export function getSupportedAppChains(): readonly Chain[] {
  if (isLocalOnlyDeployMode()) return [LOCAL_CHAIN]
  return [MAINNET_CHAIN, TESTNET_CHAIN, ARC_TESTNET_CHAIN]
}

export function getSupportedAppChainIds(): readonly number[] {
  return getSupportedAppChains().map((c) => c.id)
}

export function isSupportedAppChainId(chainId: number | null | undefined): boolean {
  if (chainId == null || !Number.isFinite(chainId)) return false
  return getSupportedAppChainIds().includes(Math.trunc(chainId))
}

export function getAppChainById(chainId: number | null | undefined): Chain | null {
  if (chainId == null || !Number.isFinite(chainId)) return null
  const id = Math.trunc(chainId)
  return getSupportedAppChains().find((c) => c.id === id) ?? null
}

/**
 * Resolve the active app chain from the wallet.
 * Returns null when chain is unknown or unsupported.
 */
export function resolveActiveAppChain(walletChainId: number | null | undefined): Chain | null {
  return getAppChainById(walletChainId)
}

/**
 * @deprecated Prefer `resolveActiveAppChain(walletChainId)` / `DEFAULT_APP_CHAIN`.
 * Kept as Privy default + legacy import alias (Sepolia, or local when local-only).
 */
export const APP_CHAIN: Chain = isLocalOnlyDeployMode() ? LOCAL_CHAIN : DEFAULT_APP_CHAIN
