import { formatUnits, type Abi } from 'viem'

import {
  createBridgeTransfer,
  fetchBridgeConfig,
  patchBridgeTransfer,
  type BridgeConfig,
  type BridgeEligibleBalance,
  type BridgePurpose,
} from '@/api/bridge'
import { assertAcceptedBridgeSelection } from '@/bridge/acceptedSources'
import { bridgeUsdcToArcTestnet } from '@/bridge/cctpBridge'
import { setActiveFundingHopPhase, withFundingHop } from '@/bridge/withFundingHop'
import { ARC_TESTNET_CHAIN_ID } from '@/contract_config/contractNetwork'
import { isCircleAppWallet, type AppWallet } from '@/wallet/appWallet'
import { isCircleSupportedChainId } from '@/circle/chainMap'
import { ensureWalletChain, getPublicClient } from '@/wallet/viemClients'

export type BridgeFundingPhase =
  | 'idle'
  | 'bridging'
  | 'depositing'
  | 'approving'
  | 'repaying'

export type EnsureArcUsdcResult = {
  transferId: string | null
  bridged: boolean
  /** True when Arc already had enough USDC so CCTP was skipped. */
  skippedBridge: boolean
}

const ERC20_BALANCE_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const satisfies Abi

async function readArcUsdcBalanceHuman(
  walletAddress: string,
  config: BridgeConfig,
): Promise<number | null> {
  const dest = config.destination
  if (!dest?.usdcAddress || !walletAddress) return null
  try {
    const client = getPublicClient(dest.chainId || ARC_TESTNET_CHAIN_ID)
    const raw = await client.readContract({
      address: dest.usdcAddress as `0x${string}`,
      abi: ERC20_BALANCE_ABI,
      functionName: 'balanceOf',
      args: [walletAddress as `0x${string}`],
    })
    const decimals = dest.usdcDecimals ?? 6
    const n = Number(formatUnits(typeof raw === 'bigint' ? raw : 0n, decimals))
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

async function softPatchMinted(accessToken: string, transferId: string): Promise<void> {
  try {
    await patchBridgeTransfer(accessToken, transferId, { status: 'minted' })
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn('[ensureArcUsdc] patch minted failed (continuing; USDC may already be on Arc)', e)
    }
  }
}

async function ensureArcOrBestEffort(wallet: AppWallet, destChainId: number): Promise<void> {
  try {
    await ensureWalletChain(wallet, destChainId)
  } catch {
    /* best-effort restore before clearing funding hop */
  }
}

/**
 * If the selected balance is off-Arc, create a bridge transfer, run Bridge Kit, mark minted.
 * Always ends with the wallet switched to Arc Testnet (deposit/repay destination).
 * Circle hops run under deposit-scoped `fundingHop` so auth.wallet / auth.chainId stay frozen.
 * Callers should wrap deposit + restore in `withBridgeSessionBusy` as well (nestable).
 */
export async function ensureArcUsdcForAction(params: {
  accessToken: string
  wallet: AppWallet
  /** Frozen session (Arc) address — mint recipient and post-hop identity. */
  walletAddress: string
  amountHuman: number
  purpose: BridgePurpose
  selected: BridgeEligibleBalance
  loanRequestId?: string
  onPhase?: (phase: BridgeFundingPhase) => void
  /** Pre-fetched config; fetched on demand when omitted. */
  bridgeConfig?: BridgeConfig | null
}): Promise<EnsureArcUsdcResult> {
  const amount = params.amountHuman
  if (!(amount > 0)) throw new Error('Amount must be greater than zero.')

  const config = params.bridgeConfig ?? (await fetchBridgeConfig())
  let selected = params.selected
  assertAcceptedBridgeSelection(selected, config)

  const destChainId = config.destination?.chainId ?? ARC_TESTNET_CHAIN_ID
  /** Always mint / land funds to the frozen session address (Circle Arc SCA). */
  const sessionWallet = params.walletAddress

  if (!selected.requiresBridge) {
    await ensureWalletChain(params.wallet, destChainId)
    return { transferId: null, bridged: false, skippedBridge: false }
  }

  if (isCircleAppWallet(params.wallet) && !isCircleSupportedChainId(selected.chainId)) {
    throw new Error(
      `Circle Wallet cannot bridge from ${selected.label || `chain ${selected.chainId}`}. Pick a Circle-supported source or use another wallet.`,
    )
  }

  if (!selected.bridgeKitId) {
    const source = (config.sources ?? []).find((s) => s.chainId === selected.chainId)
    if (!source?.bridgeKitId) {
      throw new Error('Selected chain cannot bridge to Arc.')
    }
    selected = { ...selected, bridgeKitId: source.bridgeKitId }
  }

  if (selected.sufficient === false) {
    throw new Error(`Insufficient USDC on ${selected.label}.`)
  }

  // Idempotent: skip CCTP when Arc already holds enough USDC (retry after mint).
  const arcBal = await readArcUsdcBalanceHuman(sessionWallet, config)
  if (arcBal != null && arcBal + 1e-9 >= amount) {
    await ensureWalletChain(params.wallet, destChainId)
    return { transferId: null, bridged: false, skippedBridge: true }
  }

  return withFundingHop(
    {
      sessionChainId: destChainId,
      sessionWallet,
      hopChainId: selected.chainId,
      purpose: params.purpose === 'repayment' ? 'repayment' : 'deposit',
      phase: 'switching_source',
    },
    async () => {
      try {
        params.onPhase?.('bridging')
        setActiveFundingHopPhase('bridging')

        const transfer = await createBridgeTransfer(params.accessToken, {
          bridge_kit_source: selected.bridgeKitId ?? undefined,
          source_chain_id: selected.chainId,
          amount: String(amount),
          recipient_address: sessionWallet,
          purpose: params.purpose,
          loan_request_id: params.loanRequestId,
        })

        await bridgeUsdcToArcTestnet({
          wallet: params.wallet,
          sourceChainId: selected.chainId,
          bridgeKitSource: selected.bridgeKitId!,
          amountHuman: String(amount),
          recipientAddress: sessionWallet,
        })

        await softPatchMinted(params.accessToken, transfer.id)

        setActiveFundingHopPhase('switching_arc')
        await ensureWalletChain(params.wallet, destChainId)
        return { transferId: transfer.id, bridged: true, skippedBridge: false }
      } catch (e) {
        await ensureArcOrBestEffort(params.wallet, destChainId)
        throw e
      }
    },
  )
}
