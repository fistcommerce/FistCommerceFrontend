import { Link, useLocation } from 'react-router-dom'

import logo from '@/assets/logo.png'
import mobileHamburgerIcon from '@/assets/mobile-hamburger.png'
import mobileNotificationIcon from '@/assets/mobile-notification.png'
import mobileUserIcon from '@/assets/mobile-user.png'
import WalletNetworkMark from '@/components/session/WalletNetworkMark'
import { useAppSelector } from '@/store/hooks'

import type { DashboardBellIconProps, DashboardTopBarProps } from './types'

function BellIcon({ className }: DashboardBellIconProps) {
  return (
    <svg
      className={className}
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

const DashboardTopBar = ({
  title = 'Dashboard',
  breadcrumbs,
  breadcrumbLinksMuted,
  walletDisplay,
  notificationUnread,
  onMenuClick,
  menuButtonAriaLabel,
}: DashboardTopBarProps) => {
  const { pathname } = useLocation()
  const walletChainId = useAppSelector((s) => s.wallet.chainId)
  const authChainId = useAppSelector((s) => s.auth.chainId)
  const markChainId = walletChainId ?? authChainId
  const isMerchantDashboard = pathname.startsWith('/dashboard/merchant')
  const profileTo = isMerchantDashboard
    ? '/dashboard/merchant/profile/overview'
    : '/dashboard/investor/profile/overview'
  const supportTo = isMerchantDashboard
    ? '/dashboard/merchant/support'
    : '/dashboard/investor/support'
  const profileWalletsHref = isMerchantDashboard
    ? '/dashboard/merchant/profile/wallets'
    : '/dashboard/investor/profile/wallets'

  const hasBreadcrumbs = Boolean(breadcrumbs && breadcrumbs.length > 0)
  const lastCrumbIndex = hasBreadcrumbs ? breadcrumbs!.length - 1 : -1

  const linkClass = breadcrumbLinksMuted
    ? 'text-[#ACACAC] font-normal hover:text-[#6B7280] shrink-0'
    : 'text-[#195EBC] font-semibold hover:underline shrink-0'

  const leftContent = hasBreadcrumbs ? (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="m-0 p-0 list-none flex flex-row flex-wrap items-center gap-x-2 gap-y-1 text-[18px] sm:text-[24px] leading-tight">
        {breadcrumbs!.map((crumb, i) => (
          <li key={`${crumb.label}-${i}`} className="flex items-center gap-x-2 min-w-0 max-w-full">
            {i > 0 ? (
              <span className="text-[#ACACAC] font-normal text-[16px] sm:text-[20px] select-none shrink-0" aria-hidden="true">
                &gt;
              </span>
            ) : null}
            {crumb.to ? (
              <Link to={crumb.to} className={linkClass}>
                {crumb.label}
              </Link>
            ) : (
              <span
                className={`text-black font-semibold truncate ${i === lastCrumbIndex ? 'max-w-[min(100%,28rem)]' : ''}`}
              >
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  ) : (
    <h1 className="text-black font-semibold text-[18px] sm:text-[24px] leading-tight truncate">{title}</h1>
  )

  return (
    <header className="bg-white border-b border-[#E6E8EC] px-4 lg:px-6 py-4 lg:py-5 flex items-center justify-between gap-4 lg:gap-6">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="lg:hidden flex items-center">
          <img src={logo} alt="logo" className="w-[56px] h-[36px] object-contain" />
        </div>

        <div className="hidden lg:block min-w-0 flex-1">{leftContent}</div>
      </div>

      <div className="flex items-center gap-3 lg:gap-4 shrink-0">
        <Link
          to={supportTo}
          className="relative h-[34px] w-[34px] lg:h-[40px] lg:w-[40px] lg:border lg:border-[#E6E8EC] lg:rounded-[6px] text-[#4D5D80] flex items-center justify-center shrink-0 hover:bg-[#F9FAFB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#195EBC]"
          aria-label={notificationUnread ? 'Support and disputes, unread' : 'Support and disputes'}
        >
          <img src={mobileNotificationIcon} alt="" className="lg:hidden h-[19px] w-[19px] object-contain" />
          <BellIcon className="hidden lg:block" />
          {notificationUnread ? (
            <span
              className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#F97316] ring-2 ring-white"
              aria-hidden
            />
          ) : null}
        </Link>

        <Link
          to={profileTo}
          className="h-[34px] w-[34px] lg:h-[40px] lg:w-[40px] lg:border lg:border-[#E6E8EC] lg:rounded-[6px] text-[#4D5D80] flex items-center justify-center shrink-0"
          aria-label="Go to profile"
        >
          <img src={mobileUserIcon} alt="" className="w-[19px] h-[19px] shrink-0 object-contain" />
        </Link>

        {walletDisplay ? (
          <Link
            to={profileWalletsHref}
            className="min-h-[40px] px-3 sm:px-4 border border-[#E6E8EC] rounded-[6px] hidden lg:flex items-center gap-3 text-[14px] sm:text-[16px] text-[#4D5D80] shrink-0 bg-white no-underline hover:bg-[#F9FAFB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#195EBC]"
            aria-label={`Open profile Wallets tab — ${walletDisplay}`}
          >
            <span className="font-medium text-[#1a1a1a] tracking-tight tabular-nums truncate max-w-[120px] sm:max-w-[200px]">
              {walletDisplay}
            </span>
            <span className="h-5 w-px shrink-0 bg-[#E6E8EC]" aria-hidden />
            <WalletNetworkMark chainId={markChainId} />
          </Link>
        ) : (
          <button
            type="button"
            className="bg-[#195EBC] text-white px-3 sm:px-5 min-h-[40px] rounded-[6px] text-[14px] sm:text-[16px] font-medium shrink-0 hidden lg:inline-flex items-center"
          >
            Connect Wallet
          </button>
        )}

        {onMenuClick ? (
          <button
            type="button"
            className="lg:hidden h-[34px] w-[34px] text-[#4D5D80] flex items-center justify-center shrink-0"
            aria-label={menuButtonAriaLabel ?? 'Open navigation menu'}
            onClick={onMenuClick}
          >
            <img src={mobileHamburgerIcon} alt="" className="h-[19px] w-[19px] object-contain" />
          </button>
        ) : null}
      </div>
    </header>
  )
}

export default DashboardTopBar
