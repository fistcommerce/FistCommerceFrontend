import { getSupportedAppChainManualAddDetails } from '@/wallet/appChainManualAdd'
import { isLocalOnlyDeployMode } from '@/contract_config/contractNetwork'

export default function WrongNetworkHelp() {
  const networks = getSupportedAppChainManualAddDetails()
  const mentionsTestnet = networks.some((n) => /sepolia|test/i.test(n.chainName))

  return (
    <div className="mt-4 w-full text-left text-xs leading-relaxed text-[#6B7280] space-y-3">
      <p>
        On mobile wallet browsers, approve the network prompt when it appears. If nothing happens,
        {mentionsTestnet && !isLocalOnlyDeployMode() ? (
          <>
            {' '}
            enable <span className="font-medium text-[#374151]">testnet mode</span> in your wallet
            settings when using a testnet (Arbitrum Sepolia or Arc Testnet), then
          </>
        ) : (
          <> then</>
        )}{' '}
        add a supported network manually:
      </p>
      {networks.map((details) => (
        <dl
          key={details.chainIdDecimal}
          className="rounded-lg bg-[#F9FAFB] p-3 space-y-1.5 font-mono text-[11px] break-all"
        >
          <div>
            <dt className="inline font-sans font-semibold text-[#374151]">Network: </dt>
            <dd className="inline">{details.chainName}</dd>
          </div>
          <div>
            <dt className="inline font-sans font-semibold text-[#374151]">Chain ID: </dt>
            <dd className="inline">{details.chainIdDecimal}</dd>
          </div>
          <div>
            <dt className="inline font-sans font-semibold text-[#374151]">RPC URL: </dt>
            <dd className="inline">{details.rpcUrl}</dd>
          </div>
          {details.explorerUrl ? (
            <div>
              <dt className="inline font-sans font-semibold text-[#374151]">Explorer: </dt>
              <dd className="inline">{details.explorerUrl}</dd>
            </div>
          ) : null}
          <div>
            <dt className="inline font-sans font-semibold text-[#374151]">Currency: </dt>
            <dd className="inline">{details.currencySymbol}</dd>
          </div>
        </dl>
      ))}
    </div>
  )
}
