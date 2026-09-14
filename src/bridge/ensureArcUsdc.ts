import {
  createBridgeTransfer,
  patchBridgeTransfer,
  type BridgeEligibleBalance,
  type BridgePurpose,
} from '@/api/bridge'
import { bridgeUsdcToArcTestnet } from '@/bridge/cctpBridge'
import type { AppWallet } from '@/wallet/appWallet'
import { ensureWalletChain } from '@/wallet/viemClients'
import { ARC_TESTNET_CHAIN_ID } from '@/contract_config/contractNetwork'

export type BridgeFundingPhase =
  | 'idle'
  | 'bridging'
  | 'depositing'
  | 'approving'
  | 'repaying'

/**
 * If the selected balance is off-Arc, create a bridge transfer, run Bridge Kit, mark minted.
 * Always ends with the wallet switched back to Arc Testnet.
 */
export async function ensureArcUsdcForAction(params: {
  accessToken: string
  wallet: AppWallet
  walletAddress: string
  amountHuman: number
  purpose: BridgePurpose
  selected: BridgeEligibleBalance
  loanRequestId?: string
  onPhase?: (phase: BridgeFundingPhase) => void
}): Promise<{ transferId: string | null; bridged: boolean }> {
  const amount = params.amountHuman
  if (!(amount > 0)) throw new Error('Amount must be greater than zero.')

  if (!params.selected.requiresBridge) {
    await ensureWalletChain(params.wallet, ARC_TESTNET_CHAIN_ID)
    return { transferId: null, bridged: false }
  }

  if (!params.selected.bridgeKitId) {
    throw new Error('Selected chain cannot bridge to Arc.')
  }
  if (params.selected.sufficient === false) {
    throw new Error(`Insufficient USDC on ${params.selected.label}.`)
  }

  params.onPhase?.('bridging')
  const transfer = await createBridgeTransfer(params.accessToken, {
    bridge_kit_source: params.selected.bridgeKitId,
    source_chain_id: params.selected.chainId,
    amount: String(amount),
    recipient_address: params.walletAddress,
    purpose: params.purpose,
    loan_request_id: params.loanRequestId,
  })

  await bridgeUsdcToArcTestnet({
    wallet: params.wallet,
    sourceChainId: params.selected.chainId,
    bridgeKitSource: params.selected.bridgeKitId,
    amountHuman: String(amount),
    recipientAddress: params.walletAddress,
  })

  await patchBridgeTransfer(params.accessToken, transfer.id, {
    status: 'minted',
  })

  await ensureWalletChain(params.wallet, ARC_TESTNET_CHAIN_ID)
  return { transferId: transfer.id, bridged: true }
}
