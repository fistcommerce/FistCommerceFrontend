import { useCallback, useMemo, useState } from 'react'
import { useLogout, usePrivy } from '@privy-io/react-auth'

import { mintStellarTestTokens } from '@/api/stellarFaucet'
import walletIcon from '@/assets/Icon (1).png'
import EmbeddedWalletKeyBackup from '@/components/wallet/EmbeddedWalletKeyBackup'
import {
  canMintTestTokens,
  getAcceptedTokenDisplayName,
  getAppChainDisplayName,
} from '@/contract_config/contractNetwork'
import { useInvestorOnChainBalances } from '@/hooks/useInvestorOnChainBalances'
import { useTestnetContracts } from '@/hooks/useTestnetContracts'
import { useWallet } from '@/hooks/useWallet'
import { disconnectPrivySession } from '@/session/disconnectPrivySession'
import { resetUserSession } from '@/session/resetUserSession'
import { isStellarChainId, STELLAR_TESTNET_LABEL } from '@/stellar/chain'
import { STELLAR_TEST_ASSET_CODE, STELLAR_TEST_ASSET_ISSUER } from '@/stellar/testAsset'
import { addFistUsdTrustlineViaKit, disconnectStellarWalletKit } from '@/stellar/walletsKit'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { useActiveWallet } from '@/wallet/useActiveWallet'
import { toAppUserFacingError } from '@/errors/toAppUserFacingError'

const MINT_QUICK_AMOUNTS = [1_000, 5_000, 10_000, 50_000] as const

function walletClientTypeLabel(walletClientType: string | null | undefined): string {
  if (!walletClientType) return 'Wallet'
  const byType: Record<string, string> = {
    privy: 'Embedded Wallet',
    metamask: 'MetaMask',
    phantom: 'Phantom',
    wallet_connect: 'WalletConnect',
    coinbase_wallet: 'Coinbase Wallet',
    stellar: 'Stellar Wallet',
  }
  return byType[walletClientType] ?? walletClientType
}

function formatWalletBalanceDisplay(formatted: string): string {
  return formatted === '—' ? '—' : `$${formatted}`
}

const InvestorProfileWalletsTabContent = () => {
  const dispatch = useAppDispatch()
  const { logout } = useLogout()
  const { unlinkWallet } = usePrivy()
  const {
    isConnected,
    address,
    chainId,
    connector,
  } = useWallet()
  const { wallet, walletClientType } = useActiveWallet()
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const isStellar = connector === 'stellar' || isStellarChainId(chainId)
  const [disconnectPending, setDisconnectPending] = useState(false)
  const [copied, setCopied] = useState(false)
  const [mintAmount, setMintAmount] = useState(10_000)
  const [mintDraft, setMintDraft] = useState('10000')
  const [mintError, setMintError] = useState<string | null>(null)
  const [mintSuccess, setMintSuccess] = useState<string | null>(null)
  const [stellarMintPending, setStellarMintPending] = useState(false)
  const [trustlinePending, setTrustlinePending] = useState(false)

  const contracts = useTestnetContracts()
  const showEvmMintFaucet =
    !isStellar && canMintTestTokens(contracts.isConnected ? contracts.chainId : undefined)
  const showStellarMintFaucet = isStellar
  const showMintFaucet = showEvmMintFaucet || showStellarMintFaucet
  const acceptedTokenName = isStellar
    ? 'FISTUSD'
    : getAcceptedTokenDisplayName(contracts.isConnected ? contracts.chainId : undefined)
  const {
    investmentBalanceDisplay,
    walletBalanceDisplay: onChainWalletBalanceDisplay,
    poolPositionLoading,
    stellar,
  } = useInvestorOnChainBalances()

  const walletBalanceDisplay = useMemo(() => {
    if (isStellar) return onChainWalletBalanceDisplay
    if (!contracts.isConnected) return '—'
    if (contracts.isContractsLoading) return 'Loading…'
    return formatWalletBalanceDisplay(contracts.mockTokenBalanceFormatted)
  }, [
    isStellar,
    onChainWalletBalanceDisplay,
    contracts.isConnected,
    contracts.isContractsLoading,
    contracts.mockTokenBalanceFormatted,
  ])

  const investmentBalanceLabel = useMemo(() => {
    if (isStellar) {
      if (poolPositionLoading) return 'Loading…'
      return investmentBalanceDisplay
    }
    if (!contracts.isConnected) return 'Connect wallet to view pool position.'
    if (poolPositionLoading) return 'Loading…'
    return investmentBalanceDisplay === '—' ? '—' : investmentBalanceDisplay
  }, [isStellar, contracts.isConnected, investmentBalanceDisplay, poolPositionLoading])

  const mintDisabledReason = useMemo(() => {
    if (!showMintFaucet) return 'Test token minting is not available on mainnet.'
    if (isStellar) {
      if (!isConnected || !address) return 'Connect your Stellar wallet to mint test tokens.'
      if (!accessToken?.trim()) return 'Sign in to mint test tokens.'
      if (mintAmount <= 0) return 'Enter an amount greater than zero.'
      return null
    }
    if (!contracts.isConnected) return 'Connect your wallet to mint test tokens.'
    if (!contracts.isCorrectNetwork) {
      return `Switch your wallet to ${getAppChainDisplayName(contracts.testnetChain.id)} to mint test tokens.`
    }
    if (mintAmount <= 0) return 'Enter an amount greater than zero.'
    return null
  }, [
    showMintFaucet,
    isStellar,
    isConnected,
    address,
    accessToken,
    contracts.isConnected,
    contracts.isCorrectNetwork,
    contracts.testnetChain.id,
    mintAmount,
  ])

  const chainLabel = chainId != null ? getAppChainDisplayName(chainId) : '—'
  const appNetworkLabel = isStellar
    ? STELLAR_TESTNET_LABEL
    : getAppChainDisplayName(contracts.testnetChain.id)
  const displayWalletClientType = isStellar ? 'stellar' : walletClientType
  const mintPending = isStellar ? stellarMintPending : contracts.isWritePending

  const copyAddress = useCallback(async () => {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard denied or unavailable */
    }
  }, [address])

  const handleMintDraftChange = (nextRaw: string) => {
    const cleaned = nextRaw.replace(/[^\d.,]/g, '')
    setMintDraft(cleaned)
    const n = Number(cleaned.replace(/,/g, ''))
    if (Number.isFinite(n) && n > 0) setMintAmount(n)
    else setMintAmount(0)
    setMintError(null)
    setMintSuccess(null)
  }

  const handleMintQuickSelect = (value: number) => {
    setMintAmount(value)
    setMintDraft(String(value))
    setMintError(null)
    setMintSuccess(null)
  }

  const handleAddTrustline = async () => {
    if (!address) {
      setMintError('Connect your Stellar wallet first.')
      return
    }
    setMintError(null)
    setMintSuccess(null)
    setTrustlinePending(true)
    try {
      const { hash } = await addFistUsdTrustlineViaKit(address)
      if (hash === 'already-trusted') {
        setMintSuccess(`${STELLAR_TEST_ASSET_CODE} trustline already exists. You can mint now.`)
      } else {
        setMintSuccess(
          `${STELLAR_TEST_ASSET_CODE} trustline added. Tx: ${hash.slice(0, 10)}… You can mint now.`,
        )
      }
    } catch (e) {
      setMintError(
        toAppUserFacingError(e, {
          fallback: `Could not add ${STELLAR_TEST_ASSET_CODE} trustline.`,
          context: 'mint',
        }),
      )
    } finally {
      setTrustlinePending(false)
    }
  }

  const handleMint = async () => {
    if (mintDisabledReason) {
      setMintError(mintDisabledReason)
      return
    }

    setMintError(null)
    setMintSuccess(null)
    try {
      if (isStellar) {
        setStellarMintPending(true)
        const result = await mintStellarTestTokens({
          amount: mintAmount,
          accessToken: accessToken || '',
        })
        const shortHash = result.hash ? `${result.hash.slice(0, 10)}…` : 'submitted'
        setMintSuccess(
          `Minted ${result.amount} ${result.asset}. Tx: ${shortHash}`,
        )
        stellar.refresh()
        return
      }
      const hash = await contracts.mintMockTokens(mintAmount)
      setMintSuccess(`Minted ${mintAmount.toLocaleString()} test tokens. Tx: ${hash.slice(0, 10)}…`)
    } catch (e) {
      setMintError(
        toAppUserFacingError(e, {
          fallback: 'Could not mint test tokens.',
          context: 'mint',
        }),
      )
    } finally {
      setStellarMintPending(false)
    }
  }

  const showTrustlineCta =
    isStellar &&
    Boolean(mintError && /trustline/i.test(mintError))

  const handleDisconnect = async () => {
    setDisconnectPending(true)
    try {
      resetUserSession(dispatch)
      if (isStellar) {
        await disconnectStellarWalletKit()
      } else {
        await disconnectPrivySession(wallet, logout, { unlinkWallet })
      }
      window.location.replace('/onboarding/choose-role')
    } catch (e) {
      console.error(e)
      // Still leave the app session even if wallet teardown partially fails.
      window.location.replace('/onboarding/choose-role')
    } finally {
      setDisconnectPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-[8px] border border-[#E6E8EC] bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[#4D5D80] text-[28px] font-semibold leading-tight">Connected Wallet</h2>
        </div>

        {!isConnected ? (
          <p className="mt-4 text-[#6B7488] text-[14px] leading-relaxed">No wallet connected.</p>
        ) : (
          <article className="mt-4 rounded-[6px] border border-[#195EBC] bg-white p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-3 min-w-0">
                <div className="h-10 w-10 shrink-0 rounded-[6px] bg-[#EEF2F6] flex items-center justify-center">
                  <img src={walletIcon} alt="" className="h-5 w-5 object-contain" />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[#0B1220] text-[24px] font-semibold leading-tight">
                      {walletClientTypeLabel(displayWalletClientType)}
                    </p>
                    <span className="rounded-full bg-[#E8EFFB] px-2 py-0.5 text-[11px] text-[#195EBC] font-medium">
                      Primary
                    </span>
                    <span className="text-[#16A34A] text-[11px] font-medium">Connected</span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-2 min-w-0">
                    <p className="text-[#0B1220] text-[11px] sm:text-[12px] break-all font-mono">{address}</p>
                    <button
                      type="button"
                      onClick={() => void copyAddress()}
                      className="shrink-0 rounded-[4px] border border-[#E6E8EC] bg-white px-2 py-1 text-[11px] font-medium text-[#195EBC] hover:bg-[#F9FAFB] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#195EBC]"
                      aria-label={copied ? 'Address copied' : 'Copy wallet address'}
                    >
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="mt-1 text-[#8B92A3] text-[12px]">{chainLabel}</p>
                  <button
                    type="button"
                    onClick={() => void handleDisconnect()}
                    disabled={disconnectPending}
                    className="mt-2 text-[#DC2626] text-[12px] underline disabled:opacity-50 disabled:no-underline"
                  >
                    {disconnectPending ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch shrink-0 w-full lg:w-auto">
                <div className="flex-1 min-w-38 rounded-[6px] border border-[#E6E8EC] bg-[#F9FAFB] px-4 py-3">
                  <p className="text-[#8B92A3] text-[12px]">Wallet balance</p>
                  <p className="mt-1 text-[#0B1220] text-[22px] sm:text-[24px] font-semibold leading-tight">
                    {walletBalanceDisplay}
                  </p>
                  <p className="mt-1 text-[#8B92A3] text-[11px]">
                    {isStellar ? `${acceptedTokenName} (Horizon)` : `${acceptedTokenName} (for deposits)`}
                  </p>
                  {isStellar && stellar.error ? (
                    <p className="mt-1 text-[#DC2626] text-[11px]">{stellar.error}</p>
                  ) : null}
                </div>
                <div className="flex-1 min-w-38 rounded-[6px] border border-[#E6E8EC] bg-[#F9FAFB] px-4 py-3">
                  <p className="text-[#8B92A3] text-[12px]">Investment balance</p>
                  <p className="mt-1 text-[#0B1220] text-[22px] sm:text-[24px] font-semibold leading-tight">
                    {investmentBalanceLabel}
                  </p>
                  <p className="mt-1 text-[#8B92A3] text-[11px]">
                    {isStellar ? 'TradeCreditPool units' : 'FundingPool position'}
                  </p>
                </div>
              </div>
            </div>
          </article>
        )}
      </section>

      {!isStellar ? <EmbeddedWalletKeyBackup /> : null}

      {showMintFaucet ? (
        <section className="rounded-[8px] border border-[#E6E8EC] bg-white p-4 sm:p-5">
          <h2 className="text-[#4D5D80] text-[22px] font-semibold leading-tight">Testnet token faucet</h2>
          <p className="mt-2 text-[#6B7488] text-[14px] leading-relaxed">
            {isStellar
              ? `Mint ${acceptedTokenName} to your connected wallet on ${appNetworkLabel}. If needed, add the ${acceptedTokenName} trustline with your wallet (issuer ${STELLAR_TEST_ASSET_ISSUER.slice(0, 4)}…${STELLAR_TEST_ASSET_ISSUER.slice(-4)}), then mint.`
              : `Mint ${acceptedTokenName} tokens to your connected wallet on ${appNetworkLabel}. Use these to deposit into the lending pool — your investment balance is tracked separately as pool shares.`}
          </p>

          {!isConnected ? (
            <p className="mt-4 text-[#6B7488] text-[14px]">Connect your wallet to mint test tokens.</p>
          ) : (
            <div className="mt-4 rounded-[6px] border border-[#E6E8EC] bg-[#F9FAFB] p-4 sm:p-5">
              {isStellar ? (
                <div className="mb-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleAddTrustline()}
                    disabled={trustlinePending || !address}
                    className="rounded-[6px] border border-[#195EBC] bg-white px-4 py-2.5 text-[#195EBC] text-[14px] font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#E8EFFB]"
                  >
                    {trustlinePending
                      ? 'Confirm in wallet…'
                      : `Add ${STELLAR_TEST_ASSET_CODE} trustline`}
                  </button>
                </div>
              ) : null}
              <label className="block text-[#6B7488] text-[13px] font-medium" htmlFor="mint-amount">
                Amount to mint
              </label>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1 max-w-[280px]">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#667085] text-[16px] font-semibold">
                    $
                  </span>
                  <input
                    id="mint-amount"
                    inputMode="decimal"
                    autoComplete="off"
                    value={mintDraft}
                    onChange={(e) => handleMintDraftChange(e.target.value)}
                    className="w-full rounded-[6px] border border-[#D9DEE8] bg-white py-2.5 pl-8 pr-3 text-[#0B1220] text-[16px] font-semibold outline-none focus:border-[#195EBC]"
                    aria-label="Amount to mint"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleMint()}
                  disabled={Boolean(mintDisabledReason) || mintPending || trustlinePending}
                  className="rounded-[6px] bg-[#195EBC] px-5 py-2.5 text-white text-[14px] font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#144a96]"
                >
                  {mintPending ? 'Minting…' : 'Mint test tokens'}
                </button>
              </div>
              {showTrustlineCta ? (
                <p className="mt-3 text-[#B45309] text-[13px]">
                  Approve the trustline in Freighter/Varial when prompted, then mint again.
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {MINT_QUICK_AMOUNTS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleMintQuickSelect(value)}
                    className={`rounded-[4px] px-3 py-1.5 text-[12px] border ${
                      mintAmount === value
                        ? 'border-[#195EBC] bg-[#E8EFFB] text-[#195EBC]'
                        : 'border-[#E6E8EC] bg-white text-[#8B92A3]'
                    }`}
                  >
                    ${value.toLocaleString()}
                  </button>
                ))}
              </div>

              {mintDisabledReason && !mintPending ? (
                <p className="mt-3 text-[#B45309] text-[13px]">{mintDisabledReason}</p>
              ) : null}
              {mintError ? <p className="mt-3 text-[#DC2626] text-[13px]">{mintError}</p> : null}
              {mintSuccess ? <p className="mt-3 text-[#16A34A] text-[13px]">{mintSuccess}</p> : null}
            </div>
          )}
        </section>
      ) : null}
    </div>
  )
}

export default InvestorProfileWalletsTabContent
