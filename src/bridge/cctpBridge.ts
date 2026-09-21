import { BridgeKit } from '@circle-fin/bridge-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { EIP1193Provider } from 'viem'

import {
  burnTxHashFromKitPayload,
  extractBridgeTxHashes,
  type CctpBridgeTxHashes,
} from '@/bridge/cctpBridgeResult'
import type { AppWallet } from '@/wallet/appWallet'
import { ensureWalletChain } from '@/wallet/viemClients'

export type CctpBridgeOutcome = CctpBridgeTxHashes & {
  completed: boolean
  useForwarder: true
}

/**
 * Burn native USDC on a CCTP source and let Circle's Forwarder mint on Arc.
 * Resolves as soon as the burn tx hash is known so the UI is not blocked on Iris.
 */
export async function bridgeUsdcToArcTestnet(params: {
  wallet: AppWallet
  sourceChainId: number
  bridgeKitSource: string
  amountHuman: string
  recipientAddress: string
  onBurn?: (burnTxHash: string) => void
  onComplete?: (hashes: CctpBridgeTxHashes) => void
}): Promise<CctpBridgeOutcome> {
  const amount = params.amountHuman.trim()
  if (!amount || Number(amount) <= 0) {
    throw new Error('Enter a USDC amount greater than zero to bridge.')
  }
  if (!params.bridgeKitSource) {
    throw new Error('Missing Bridge Kit source chain id.')
  }

  await ensureWalletChain(params.wallet, params.sourceChainId)
  const provider = (await params.wallet.getEthereumProvider()) as EIP1193Provider
  const adapter = await createViemAdapterFromProvider({
    provider,
    capabilities: { addressContext: 'user-controlled' },
  })

  const kit = new BridgeKit()
  const events = kit as unknown as {
    on: (action: string, handler: (payload: unknown) => void) => void
    off: (action: string, handler: (payload: unknown) => void) => void
  }
  let burnTxHash: string | undefined
  let settleBurn: ((hash: string) => void) | undefined
  const burned = new Promise<string>((resolve) => {
    settleBurn = resolve
  })

  const noteBurn = (hash: string) => {
    if (!hash || burnTxHash) return
    burnTxHash = hash
    params.onBurn?.(hash)
    settleBurn?.(hash)
  }

  const onBurnEvent = (payload: unknown) => {
    const hash = burnTxHashFromKitPayload(payload)
    if (hash) noteBurn(hash)
  }

  events.on('*', onBurnEvent)
  events.on('burn', onBurnEvent)

  const bridgePromise = kit
    .bridge({
      from: {
        adapter,
        chain: params.bridgeKitSource as 'Arbitrum_Sepolia',
      },
      to: {
        chain: 'Arc_Testnet',
        recipientAddress: params.recipientAddress as `0x${string}`,
        useForwarder: true,
      },
      amount,
      token: 'USDC',
    })
    .then((result) => {
      const hashes = extractBridgeTxHashes(result)
      if (hashes.burnTxHash) noteBurn(hashes.burnTxHash)
      params.onComplete?.(hashes)
      return result
    })
    .finally(() => {
      events.off('burn', onBurnEvent)
      events.off('*', onBurnEvent)
    })

  void bridgePromise.catch((error) => {
    if (!burnTxHash && import.meta.env.DEV) {
      console.warn('[cctpBridge] background forwarder wait failed', error)
    }
  })

  try {
    const hash = await Promise.race([
      burned,
      bridgePromise.then((result) => {
        const hashes = extractBridgeTxHashes(result)
        return hashes.burnTxHash || burnTxHash || ''
      }),
    ])
    if (!hash && !burnTxHash) {
      throw new Error('Bridge burn did not return a transaction hash.')
    }
    return {
      burnTxHash: hash || burnTxHash,
      completed: false,
      useForwarder: true,
    }
  } catch (error) {
    if (burnTxHash) {
      return { burnTxHash, completed: false, useForwarder: true }
    }
    throw error
  }
}
