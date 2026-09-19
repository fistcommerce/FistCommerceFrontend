import { describe, expect, it } from 'vitest'

import { ARC_TESTNET_CHAIN_ID, TESTNET_CHAIN_ID } from '@/contract_config/contractNetwork'
import { isSupportedAppChainId } from '@/wallet/appChain'
import {
  formatInvestorInvestmentBalanceDisplay,
  formatInvestorWalletBalanceDisplay,
} from '@/wallet/investorBalanceDisplay'
import {
  canReadContractBalances,
  resolveContractReadAddress,
} from '@/wallet/resolveContractReadAddress'
import { resolveContractsChain } from '@/wallet/resolveContractsChain'

describe('resolveContractReadAddress', () => {
  it('uses live address for Privy', () => {
    expect(
      resolveContractReadAddress({
        source: 'privy',
        liveAddress: '0xLive',
        authWallet: '0xAuth',
      }),
    ).toBe('0xLive')
  })

  it('prefers funding session then auth for Circle', () => {
    expect(
      resolveContractReadAddress({
        source: 'circle',
        liveAddress: '0xHop',
        authWallet: '0xArc',
        fundingSessionWallet: '0xFrozen',
      }),
    ).toBe('0xFrozen')
    expect(
      resolveContractReadAddress({
        source: 'circle',
        liveAddress: '0xHop',
        authWallet: '0xArc',
      }),
    ).toBe('0xArc')
  })

  it('falls back to auth wallet when provider is not connected yet', () => {
    expect(
      resolveContractReadAddress({
        source: null,
        liveAddress: null,
        authWallet: '0xSession',
      }),
    ).toBe('0xSession')
  })
})

describe('canReadContractBalances', () => {
  it('requires read address and supported app chain', () => {
    expect(
      canReadContractBalances({
        readAddress: '0xabc',
        contractsChainId: ARC_TESTNET_CHAIN_ID,
        isSupportedAppChainId,
      }),
    ).toBe(true)
    expect(
      canReadContractBalances({
        readAddress: null,
        contractsChainId: ARC_TESTNET_CHAIN_ID,
        isSupportedAppChainId,
      }),
    ).toBe(false)
    expect(
      canReadContractBalances({
        readAddress: '0xabc',
        contractsChainId: 11155111,
        isSupportedAppChainId,
      }),
    ).toBe(false)
  })
})

describe('resolveContractsChain', () => {
  it('prefers live wallet app chain over auth', () => {
    expect(
      resolveContractsChain({
        walletChainId: TESTNET_CHAIN_ID,
        authChainId: ARC_TESTNET_CHAIN_ID,
      }).id,
    ).toBe(TESTNET_CHAIN_ID)
  })

  it('falls back to auth when wallet is on a CCTP hop chain', () => {
    expect(
      resolveContractsChain({
        walletChainId: 11155111,
        authChainId: ARC_TESTNET_CHAIN_ID,
      }).id,
    ).toBe(ARC_TESTNET_CHAIN_ID)
  })
})

describe('investor balance display', () => {
  const identity = (s: string) => s

  it('shows — without a read address', () => {
    expect(
      formatInvestorWalletBalanceDisplay({
        readAddress: null,
        isLoading: false,
        formattedBalance: '120.00',
        formatMetric: identity,
      }),
    ).toBe('—')
    expect(
      formatInvestorInvestmentBalanceDisplay({
        readAddress: null,
        isLoading: false,
        positionDisplay: '$50.00',
      }),
    ).toBe('—')
  })

  it('shows formatted balances when session read address exists', () => {
    expect(
      formatInvestorWalletBalanceDisplay({
        readAddress: '0xArc',
        isLoading: false,
        formattedBalance: '120.00',
        formatMetric: identity,
      }),
    ).toBe('120.00')
    expect(
      formatInvestorInvestmentBalanceDisplay({
        readAddress: '0xArc',
        isLoading: false,
        positionDisplay: '$50.00',
      }),
    ).toBe('$50.00')
  })

  it('shows — while loading even with a read address', () => {
    expect(
      formatInvestorWalletBalanceDisplay({
        readAddress: '0xArc',
        isLoading: true,
        formattedBalance: '120.00',
        formatMetric: identity,
      }),
    ).toBe('—')
  })
})
