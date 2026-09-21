import {
  createBridgeTransfer,
  fetchBridgeConfig,
  patchBridgeTransfer,
  type BridgeConfig,
  type BridgeEligibleBalance,
  type BridgePurpose,
  type BridgeTransfer,
} from '@/api/bridge'
import { assertAcceptedBridgeSelection } from '@/bridge/acceptedSources'
import { bridgeUsdcToArcTestnet } from '@/bridge/cctpBridge'
import type { CctpBridgeTxHashes } from '@/bridge/cctpBridgeResult'
import {
  hasBurnTx,
  isAwaitingMintStatus,
  isReadyToContinueStatus,
  parseBridgeAmountHuman,
  transferNeedsSignature,
} from '@/bridge/transferStatus'
import { setActiveFundingHopPhase, withFundingHop } from '@/bridge/withFundingHop'
import { ARC_TESTNET_CHAIN_ID } from '@/contract_config/contractNetwork'
import { isCircleAppWallet, type AppWallet } from '@/wallet/appWallet'
import { isCircleSupportedChainId } from '@/circle/chainMap'
import { ensureWalletChain } from '@/wallet/viemClients'

export type BridgeFundingPhase =
  | 'idle'
  | 'bridging'
  | 'depositing'
  | 'approving'
  | 'repaying'

export type EnsureArcUsdcResult = {
  transferId: string | null
  bridged: boolean
  /** Always false for CCTP sources. Arc-native selection does not skip the deposit balance gate. */
  skippedBridge: boolean
  awaitingMint: boolean
  readyToContinue: boolean
}

async function softPatch(
  accessToken: string,
  transferId: string,
  body: Record<string, unknown>,
): Promise<void> {
  try {
    await patchBridgeTransfer(accessToken, transferId, body)
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn('[ensureArcUsdc] patch failed (continuing)', body, e)
    }
  }
}

async function executeCctpBurnForTransfer(params: {
  accessToken: string
  wallet: AppWallet
  transferId: string
  sourceChainId: number
  bridgeKitSource: string
  amountHuman: string
  recipientAddress: string
}): Promise<{ burnTxHash?: string; completed: boolean }> {
  await softPatch(params.accessToken, params.transferId, { status: 'burn_pending' })

  const persistBurn = async (burnTxHash: string) => {
    await softPatch(params.accessToken, params.transferId, {
      status: 'burned',
      burn_tx_hash: burnTxHash,
      metadata: { useForwarder: true },
    })
  }
  const persistMint = (hashes: CctpBridgeTxHashes) => {
    if (!hashes.mintTxHash && !hashes.burnTxHash) return
    void softPatch(params.accessToken, params.transferId, {
      ...(hashes.burnTxHash ? { burn_tx_hash: hashes.burnTxHash } : {}),
      ...(hashes.mintTxHash
        ? { status: 'minted', mint_tx_hash: hashes.mintTxHash }
        : hashes.burnTxHash
          ? { status: 'attesting' }
          : {}),
    })
  }

  const outcome = await bridgeUsdcToArcTestnet({
    wallet: params.wallet,
    sourceChainId: params.sourceChainId,
    bridgeKitSource: params.bridgeKitSource,
    amountHuman: params.amountHuman,
    recipientAddress: params.recipientAddress,
    onBurn: (hash) => {
      void persistBurn(hash)
    },
    onComplete: persistMint,
  })

  if (outcome.burnTxHash) await persistBurn(outcome.burnTxHash)
  return outcome
}

async function ensureArcOrBestEffort(wallet: AppWallet, destChainId: number): Promise<void> {
  try {
    await ensureWalletChain(wallet, destChainId)
  } catch {
    /* best-effort restore before clearing funding hop */
  }
}

function skippedBurnResult(transferId: string, readyToContinue: boolean): EnsureArcUsdcResult {
  return {
    transferId,
    bridged: true,
    skippedBridge: false,
    awaitingMint: !readyToContinue,
    readyToContinue,
  }
}

/**
 * Resume an unsigned transfer from the tracking page. Never re-burns a transfer
 * that already has a burn transaction hash.
 */
export async function resumeUnsignedBridgeTransfer(params: {
  accessToken: string
  wallet: AppWallet
  walletAddress: string
  transfer: BridgeTransfer
  bridgeConfig?: BridgeConfig | null
}): Promise<EnsureArcUsdcResult> {
  const destChainId =
    params.bridgeConfig?.destination?.chainId ??
    (await fetchBridgeConfig()).destination?.chainId ??
    ARC_TESTNET_CHAIN_ID
  const sessionWallet = params.transfer.recipient_address?.trim() || params.walletAddress
  const sourceChainId = params.transfer.source_chain_id
  const bridgeKitSource = params.transfer.bridge_kit_source?.trim()
  const amountHuman = params.transfer.amount_human?.trim() || String(parseBridgeAmountHuman(params.transfer.amount_human))

  if (isReadyToContinueStatus(params.transfer.status)) {
    await ensureWalletChain(params.wallet, destChainId)
    return skippedBurnResult(params.transfer.id, true)
  }
  if (hasBurnTx(params.transfer)) {
    await ensureWalletChain(params.wallet, destChainId)
    return skippedBurnResult(params.transfer.id, false)
  }
  if (!transferNeedsSignature(params.transfer)) {
    throw new Error('This Bridge is not waiting for a wallet signature.')
  }
  if (!bridgeKitSource) {
    throw new Error('This Bridge is missing the source network needed to sign.')
  }
  if (!sourceChainId) {
    throw new Error('This Bridge is missing the source network needed to sign.')
  }
  if (!(parseBridgeAmountHuman(amountHuman) > 0)) {
    throw new Error('This Bridge does not have a valid amount to sign.')
  }
  if (isCircleAppWallet(params.wallet) && !isCircleSupportedChainId(sourceChainId)) {
    throw new Error('Circle Wallet cannot sign this Bridge from the recorded source network.')
  }

  return withFundingHop(
    {
      sessionChainId: destChainId,
      sessionWallet,
      hopChainId: sourceChainId,
      purpose: params.transfer.purpose === 'repayment' ? 'repayment' : 'deposit',
      phase: 'switching_source',
    },
    async () => {
      try {
        setActiveFundingHopPhase('bridging')
        const outcome = await executeCctpBurnForTransfer({
          accessToken: params.accessToken,
          wallet: params.wallet,
          transferId: params.transfer.id,
          sourceChainId,
          bridgeKitSource,
          amountHuman,
          recipientAddress: sessionWallet,
        })
        setActiveFundingHopPhase('switching_arc')
        await ensureWalletChain(params.wallet, destChainId)
        return {
          transferId: params.transfer.id,
          bridged: true,
          skippedBridge: false,
          awaitingMint: !outcome.completed,
          readyToContinue: Boolean(outcome.completed),
        }
      } catch (e) {
        await ensureArcOrBestEffort(params.wallet, destChainId)
        throw e
      }
    },
  )
}

/**
 * If the selected balance is off-Arc, create a bridge transfer and burn on the source chain.
 * Returns after burn so callers can leave while Circle Forwarder + Iris complete the mint.
 * Always ends with the wallet switched to Arc Testnet.
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
  metadata?: Record<string, unknown>
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
    return {
      transferId: null,
      bridged: false,
      skippedBridge: false,
      awaitingMint: false,
      readyToContinue: false,
    }
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
          metadata: {
            useForwarder: true,
            ...(params.metadata ?? {}),
          },
        })

        if (isReadyToContinueStatus(transfer.status)) {
          setActiveFundingHopPhase('switching_arc')
          await ensureWalletChain(params.wallet, destChainId)
          return {
            transferId: transfer.id,
            bridged: true,
            skippedBridge: false,
            awaitingMint: false,
            readyToContinue: true,
          }
        }

        if (hasBurnTx(transfer) && isAwaitingMintStatus(transfer.status)) {
          setActiveFundingHopPhase('switching_arc')
          await ensureWalletChain(params.wallet, destChainId)
          return {
            transferId: transfer.id,
            bridged: true,
            skippedBridge: false,
            awaitingMint: true,
            readyToContinue: false,
          }
        }

        const outcome = await executeCctpBurnForTransfer({
          accessToken: params.accessToken,
          wallet: params.wallet,
          transferId: transfer.id,
          sourceChainId: selected.chainId,
          bridgeKitSource: selected.bridgeKitId!,
          amountHuman: String(amount),
          recipientAddress: sessionWallet,
        })

        setActiveFundingHopPhase('switching_arc')
        await ensureWalletChain(params.wallet, destChainId)
        return {
          transferId: transfer.id,
          bridged: true,
          skippedBridge: false,
          awaitingMint: !outcome.completed,
          readyToContinue: Boolean(outcome.completed),
        }
      } catch (e) {
        await ensureArcOrBestEffort(params.wallet, destChainId)
        throw e
      }
    },
  )
}
