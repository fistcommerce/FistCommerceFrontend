import logo from '@/assets/logo.png'
import mobileHamburgerIcon from '@/assets/mobile-hamburger.png'
import mobileUserIcon from '@/assets/mobile-user.png'
import WalletNetworkMark from '@/components/session/WalletNetworkMark'
import { getAppChainDisplayName } from '@/contract_config/contractNetwork'
import { useAppSelector } from '@/store/hooks'

import type { AdminTopBarProps } from './types'

const iconButtonFrame =
  'h-[40px] w-[40px] border border-[#E6E8EC] rounded-[6px] text-[#4D5D80] flex items-center justify-center shrink-0 hover:bg-[#F9FAFB]'

const AdminTopBar = ({
  title,
  leading,
  onMenuClick,
  menuButtonAriaLabel,
  walletDisplay,
  networkDisplayName,
  onConnectWallet,
  connectWalletPending,
}: AdminTopBarProps) => {
  const walletChainId = useAppSelector((s) => s.wallet.chainId)
  const authChainId = useAppSelector((s) => s.auth.chainId)
  const markChainId = walletChainId ?? authChainId
  const networkLabel =
    networkDisplayName ?? getAppChainDisplayName(markChainId)
  const titleBlock = (
    <h1 className="text-black font-semibold text-[18px] sm:text-[24px] leading-tight truncate">{title}</h1>
  )

  return (
    <header className="bg-white border-b border-[#E6E8EC] px-4 lg:px-6 py-4 lg:py-5">
      {/* Mobile / tablet: logo — user, menu (title lives below bar in layout) */}
      <div className="flex lg:hidden items-center justify-between gap-3">
        <img
          src={logo}
          alt=""
          className="w-[45px] h-[40px] max-w-[45px] max-h-[40px] object-contain shrink-0"
        />
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" className={iconButtonFrame} aria-label="Account">
            <img src={mobileUserIcon} alt="" className="h-[19px] w-[19px] object-contain" />
          </button>
          {onMenuClick ? (
            <button
              type="button"
              className={iconButtonFrame}
              aria-label={menuButtonAriaLabel ?? 'Open navigation menu'}
              onClick={onMenuClick}
            >
              <img src={mobileHamburgerIcon} alt="" className="h-5 w-5 object-contain" />
            </button>
          ) : null}
        </div>
      </div>

      {leading ? (
        <div className="lg:hidden mt-3 min-w-0">
          <div className="min-w-0">{leading}</div>
        </div>
      ) : null}

      {/* Desktop */}
      <div className="hidden lg:flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1 truncate">{leading ?? titleBlock}</div>
        <div className="flex items-center gap-3 shrink-0">
          {walletDisplay ? (
            <div
              className="min-h-[40px] px-4 border border-[#E6E8EC] rounded-[6px] flex items-center gap-3 text-[14px] shrink-0 bg-white max-w-none"
              aria-label={`Connected wallet ${walletDisplay} on ${networkLabel}`}
            >
              <span className="font-medium text-[#1a1a1a] tracking-tight tabular-nums truncate">
                {walletDisplay}
              </span>
              <span className="h-5 w-px shrink-0 bg-[#E6E8EC]" aria-hidden />
              <WalletNetworkMark chainId={markChainId} />
            </div>
          ) : (
            <button
              type="button"
              onClick={onConnectWallet}
              disabled={!onConnectWallet || connectWalletPending}
              className="bg-[#195EBC] text-white px-5 min-h-[40px] rounded-[6px] text-[16px] font-medium shrink-0 inline-flex items-center disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {connectWalletPending ? 'Connecting…' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

export default AdminTopBar
