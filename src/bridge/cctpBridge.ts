import { BridgeKit } from '@circle-fin/bridge-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { EIP1193Provider } from 'viem'

import type { AppWallet } from '@/wallet/appWallet'
import { ensureWalletChain } from '@/wallet/viemClients'

const kitSingleton = new BridgeKit()

/**
 * Bridge native USDC from a CCTP source chain onto Arc Testnet via Circle Bridge Kit.
 * Switches the wallet to the source chain for burn, then Bridge Kit handles attestation/mint.
 */
export async function bridgeUsdcToArcTestnet(params: {
  wallet: AppWallet
  sourceChainId: number
  bridgeKitSource: string
  amountHuman: string
  recipientAddress: string
}): Promise<{ ok: true }> {
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

  await kitSingleton.bridge({
    from: {
      adapter,
      chain: params.bridgeKitSource as 'Arbitrum_Sepolia',
    },
    to: {
      adapter,
      chain: 'Arc_Testnet',
      recipientAddress: params.recipientAddress as `0x${string}`,
    },
    amount,
    token: 'USDC',
  })

  return { ok: true }
}
