import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BridgeConfig, BridgeEligibleBalance } from '@/api/bridge'
import { ensureArcUsdcForAction, resumeUnsignedBridgeTransfer } from '@/bridge/ensureArcUsdc'
import type { AppWallet } from '@/wallet/appWallet'

const fetchBridgeConfig = vi.fn()
const createBridgeTransfer = vi.fn()
const patchBridgeTransfer = vi.fn()
const bridgeUsdcToArcTestnet = vi.fn()
const ensureWalletChain = vi.fn()
const getPublicClient = vi.fn()
const isCircleAppWallet = vi.fn()
const dispatch = vi.fn()

vi.mock('@/api/bridge', () => ({
  fetchBridgeConfig: (...args: unknown[]) => fetchBridgeConfig(...args),
  createBridgeTransfer: (...args: unknown[]) => createBridgeTransfer(...args),
  patchBridgeTransfer: (...args: unknown[]) => patchBridgeTransfer(...args),
}))

vi.mock('@/bridge/cctpBridge', () => ({
  bridgeUsdcToArcTestnet: (...args: unknown[]) => bridgeUsdcToArcTestnet(...args),
}))

vi.mock('@/wallet/viemClients', () => ({
  ensureWalletChain: (...args: unknown[]) => ensureWalletChain(...args),
  getPublicClient: (...args: unknown[]) => getPublicClient(...args),
}))

vi.mock('@/wallet/appWallet', () => ({
  isCircleAppWallet: (...args: unknown[]) => isCircleAppWallet(...args),
}))

vi.mock('@/store/storeRef', () => ({
  getAppStore: () => ({
    getState: () => ({
      auth: { accessToken: 'Token abc', refreshToken: 'r' },
      wallet: { fundingHop: null },
    }),
    dispatch,
  }),
}))

const config: BridgeConfig = {
  destination: {
    chainId: 5042002,
    cctpDomain: 0,
    bridgeKitId: 'Arc_Testnet',
    usdcAddress: '0x1111111111111111111111111111111111111111',
    usdcDecimals: 6,
  },
  sources: [
    {
      chainId: 421614,
      cctpDomain: 3,
      label: 'Arbitrum Sepolia',
      bridgeKitId: 'Arbitrum_Sepolia',
      usdcAddress: '0x2222222222222222222222222222222222222222',
      usdcDecimals: 6,
    },
    {
      chainId: 11155111,
      cctpDomain: 0,
      label: 'Ethereum Sepolia',
      bridgeKitId: 'Ethereum_Sepolia',
      usdcAddress: '0x3333333333333333333333333333333333333333',
      usdcDecimals: 6,
    },
  ],
}

const wallet = {
  address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  getEthereumProvider: async () => ({}),
} as unknown as AppWallet

function arbSource(overrides?: Partial<BridgeEligibleBalance>): BridgeEligibleBalance {
  return {
    chainId: 421614,
    label: 'Arbitrum Sepolia',
    bridgeKitId: 'Arbitrum_Sepolia',
    usdcAddress: '0x2222222222222222222222222222222222222222',
    usdcDecimals: 6,
    requiresBridge: true,
    sufficient: true,
    balance: '100',
    ...overrides,
  }
}

describe('ensureArcUsdcForAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchBridgeConfig.mockResolvedValue(config)
    isCircleAppWallet.mockReturnValue(false)
    ensureWalletChain.mockResolvedValue(undefined)
    bridgeUsdcToArcTestnet.mockResolvedValue({
      ok: true,
      burnTxHash: `0x${'b'.repeat(64)}`,
      completed: false,
      useForwarder: true,
    })
    createBridgeTransfer.mockResolvedValue({ id: 'xfer-1', status: 'created' })
    patchBridgeTransfer.mockResolvedValue({ id: 'xfer-1', status: 'burned' })
    getPublicClient.mockReturnValue({
      readContract: vi.fn().mockResolvedValue(0n),
    })
  })

  it('switches to Arc only when source does not require bridge', async () => {
    const result = await ensureArcUsdcForAction({
      accessToken: 't',
      wallet,
      walletAddress: wallet.address!,
      amountHuman: 10,
      purpose: 'deposit',
      selected: {
        chainId: 5042002,
        label: 'Arc',
        bridgeKitId: null,
        usdcAddress: config.destination.usdcAddress,
        usdcDecimals: 6,
        requiresBridge: false,
        sufficient: true,
      },
      bridgeConfig: config,
    })
    expect(result).toEqual({
      transferId: null,
      bridged: false,
      skippedBridge: false,
      awaitingMint: false,
      readyToContinue: false,
    })
    expect(ensureWalletChain).toHaveBeenCalledWith(wallet, 5042002)
    expect(bridgeUsdcToArcTestnet).not.toHaveBeenCalled()
  })

  it('rejects non-allowlisted source chains', async () => {
    await expect(
      ensureArcUsdcForAction({
        accessToken: 't',
        wallet,
        walletAddress: wallet.address!,
        amountHuman: 10,
        purpose: 'deposit',
        selected: arbSource({ chainId: 1, bridgeKitId: 'Ethereum', label: 'Ethereum' }),
        bridgeConfig: config,
      }),
    ).rejects.toThrow(/not an accepted funding source/)
  })

  it('allows Circle CCTP under funding hop and mints to frozen Arc address', async () => {
    isCircleAppWallet.mockReturnValue(true)
    const arcAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const result = await ensureArcUsdcForAction({
      accessToken: 't',
      wallet,
      walletAddress: arcAddress,
      amountHuman: 10,
      purpose: 'deposit',
      selected: arbSource(),
      bridgeConfig: config,
    })
    expect(result.bridged).toBe(true)
    expect(createBridgeTransfer).toHaveBeenCalledWith(
      't',
      expect.objectContaining({ recipient_address: arcAddress }),
    )
    expect(bridgeUsdcToArcTestnet).toHaveBeenCalledWith(
      expect.objectContaining({ recipientAddress: arcAddress, sourceChainId: 421614 }),
    )
    expect(ensureWalletChain).toHaveBeenLastCalledWith(wallet, 5042002)
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: expect.stringContaining('beginFundingHop') }),
    )
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: expect.stringContaining('endFundingHop') }),
    )
  })

  it('allows Circle CCTP from Ethereum Sepolia hop chain', async () => {
    isCircleAppWallet.mockReturnValue(true)
    const result = await ensureArcUsdcForAction({
      accessToken: 't',
      wallet,
      walletAddress: wallet.address!,
      amountHuman: 10,
      purpose: 'deposit',
      selected: arbSource({
        chainId: 11155111,
        label: 'Ethereum Sepolia',
        bridgeKitId: 'Ethereum_Sepolia',
        usdcAddress: '0x3333333333333333333333333333333333333333',
      }),
      bridgeConfig: config,
    })
    expect(result.bridged).toBe(true)
    expect(bridgeUsdcToArcTestnet).toHaveBeenCalledWith(
      expect.objectContaining({ sourceChainId: 11155111 }),
    )
  })

  it('still bridges from the selected CCTP source when Arc already has enough USDC', async () => {
    getPublicClient.mockReturnValue({
      readContract: vi.fn().mockResolvedValue(25_000_000n),
    })
    const result = await ensureArcUsdcForAction({
      accessToken: 't',
      wallet,
      walletAddress: wallet.address!,
      amountHuman: 10,
      purpose: 'deposit',
      selected: arbSource(),
      bridgeConfig: config,
    })
    expect(result.bridged).toBe(true)
    expect(result.skippedBridge).toBe(false)
    expect(bridgeUsdcToArcTestnet).toHaveBeenCalledWith(
      expect.objectContaining({ sourceChainId: 421614 }),
    )
    expect(createBridgeTransfer).toHaveBeenCalled()
  })

  it('burns then patches burned and returns awaiting mint', async () => {
    const result = await ensureArcUsdcForAction({
      accessToken: 't',
      wallet,
      walletAddress: wallet.address!,
      amountHuman: 10,
      purpose: 'deposit',
      selected: arbSource(),
      bridgeConfig: config,
    })
    expect(result).toEqual({
      transferId: 'xfer-1',
      bridged: true,
      skippedBridge: false,
      awaitingMint: true,
      readyToContinue: false,
    })
    expect(bridgeUsdcToArcTestnet).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceChainId: 421614,
        recipientAddress: wallet.address,
        onBurn: expect.any(Function),
      }),
    )
    expect(createBridgeTransfer).toHaveBeenCalledWith(
      't',
      expect.objectContaining({ metadata: expect.objectContaining({ useForwarder: true }) }),
    )
    expect(patchBridgeTransfer).toHaveBeenCalledWith('t', 'xfer-1', { status: 'burn_pending' })
    expect(patchBridgeTransfer).toHaveBeenCalledWith(
      't',
      'xfer-1',
      expect.objectContaining({
        status: 'burned',
        burn_tx_hash: `0x${'b'.repeat(64)}`,
      }),
    )
    expect(ensureWalletChain).toHaveBeenLastCalledWith(wallet, 5042002)
  })

  it('does not start a second burn when an in-flight transfer is already burned', async () => {
    createBridgeTransfer.mockResolvedValue({
      id: 'xfer-1',
      status: 'attesting',
      burn_tx_hash: `0x${'b'.repeat(64)}`,
    })
    const result = await ensureArcUsdcForAction({
      accessToken: 't',
      wallet,
      walletAddress: wallet.address!,
      amountHuman: 10,
      purpose: 'deposit',
      selected: arbSource(),
      bridgeConfig: config,
    })
    expect(result.awaitingMint).toBe(true)
    expect(bridgeUsdcToArcTestnet).not.toHaveBeenCalled()
  })

  it('skips CCTP when a matching transfer is already minted', async () => {
    createBridgeTransfer.mockResolvedValue({ id: 'xfer-1', status: 'minted' })
    const result = await ensureArcUsdcForAction({
      accessToken: 't',
      wallet,
      walletAddress: wallet.address!,
      amountHuman: 10,
      purpose: 'deposit',
      selected: arbSource(),
      bridgeConfig: config,
    })
    expect(result).toMatchObject({
      transferId: 'xfer-1',
      bridged: true,
      awaitingMint: false,
      readyToContinue: true,
    })
    expect(bridgeUsdcToArcTestnet).not.toHaveBeenCalled()
  })

  it('continues when patch minted fails after a successful bridge', async () => {
    patchBridgeTransfer.mockRejectedValue(new Error('network'))
    const result = await ensureArcUsdcForAction({
      accessToken: 't',
      wallet,
      walletAddress: wallet.address!,
      amountHuman: 10,
      purpose: 'deposit',
      selected: arbSource(),
      bridgeConfig: config,
    })
    expect(result.bridged).toBe(true)
    expect(result.transferId).toBe('xfer-1')
  })

  it('best-effort restores Arc when bridge throws', async () => {
    bridgeUsdcToArcTestnet.mockRejectedValue(new Error('user rejected'))
    await expect(
      ensureArcUsdcForAction({
        accessToken: 't',
        wallet,
        walletAddress: wallet.address!,
        amountHuman: 10,
        purpose: 'deposit',
        selected: arbSource(),
        bridgeConfig: config,
      }),
    ).rejects.toThrow(/user rejected/)
    expect(ensureWalletChain).toHaveBeenCalledWith(wallet, 5042002)
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: expect.stringContaining('endFundingHop') }),
    )
  })
})

describe('resumeUnsignedBridgeTransfer', () => {
  const unsigned = {
    id: 'xfer-1',
    dest_chain_id: 5042002,
    source_chain_id: 421614,
    bridge_kit_source: 'Arbitrum_Sepolia',
    bridge_kit_dest: 'Arc_Testnet',
    amount_wei: '10000000',
    amount_human: '10',
    token_decimals: 6,
    recipient_address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    status: 'burn_pending',
    purpose: 'deposit' as const,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    fetchBridgeConfig.mockResolvedValue(config)
    isCircleAppWallet.mockReturnValue(false)
    ensureWalletChain.mockResolvedValue(undefined)
    bridgeUsdcToArcTestnet.mockResolvedValue({
      ok: true,
      burnTxHash: `0x${'b'.repeat(64)}`,
      completed: false,
      useForwarder: true,
    })
    patchBridgeTransfer.mockResolvedValue({ id: 'xfer-1', status: 'burned' })
  })

  it('opens a burn signature for an unsigned Bridge', async () => {
    const result = await resumeUnsignedBridgeTransfer({
      accessToken: 't',
      wallet,
      walletAddress: wallet.address!,
      transfer: unsigned,
      bridgeConfig: config,
    })
    expect(result.awaitingMint).toBe(true)
    expect(bridgeUsdcToArcTestnet).toHaveBeenCalledWith(
      expect.objectContaining({ sourceChainId: 421614, amountHuman: '10' }),
    )
    expect(patchBridgeTransfer).toHaveBeenCalledWith(
      't',
      'xfer-1',
      expect.objectContaining({
        status: 'burned',
        burn_tx_hash: `0x${'b'.repeat(64)}`,
      }),
    )
  })

  it('does not re-burn when a burn hash already exists', async () => {
    const result = await resumeUnsignedBridgeTransfer({
      accessToken: 't',
      wallet,
      walletAddress: wallet.address!,
      transfer: {
        ...unsigned,
        status: 'attesting',
        burn_tx_hash: `0x${'b'.repeat(64)}`,
      },
      bridgeConfig: config,
    })
    expect(result.awaitingMint).toBe(true)
    expect(bridgeUsdcToArcTestnet).not.toHaveBeenCalled()
  })
})
