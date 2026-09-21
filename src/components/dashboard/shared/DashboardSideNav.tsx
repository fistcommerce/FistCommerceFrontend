import { useState } from 'react'
import { useLogout } from '@privy-io/react-auth'
import { Link, useLocation } from 'react-router-dom'

import logo from '@/assets/logo.png'
import squaresFourIcon from '@/assets/SquaresFour.svg'
import coinIcon from '@/assets/Coin.svg'
import userIcon from '@/assets/ph_user.svg'
import documentNavIcon from '@/assets/Frame 1000004246.png'
import collapseArrowIcon from '@/assets/CollapseArrow.svg'
import supportNavIcon from '@/assets/mobile-notification.png'

import { isActionableBridgeStatus, trackerListPathForPurpose } from '@/bridge/transferStatus'
import { useActiveBridgeTransfers } from '@/hooks/useActiveBridgeTransfers'
import { logoutUserSession } from '@/session/logoutUserSession'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { selectIsKycVerified } from '@/store/selectors/sessionSelectors'
import { useActiveWallet } from '@/wallet/useActiveWallet'
import { dashboardHomePath } from '@/utils/userRole'

import type { DashboardBasePath, DashboardSideNavItem, DashboardSideNavProps } from './types'

const ICON_24 = 'w-[24px] h-[24px] max-w-[24px] max-h-[24px] object-contain shrink-0'

const LOGO_HEADER = 'w-[45px] h-[40px] max-w-[45px] max-h-[40px] object-contain shrink-0'

function TransfersNavIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M7 17V7" />
      <path d="M3 11l4-4 4 4" />
      <path d="M17 7v10" />
      <path d="M13 13l4 4 4-4" />
    </svg>
  )
}

function DashboardLogoutIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  )
}

function resolveDashboardBase(pathname: string, explicit?: DashboardBasePath): DashboardBasePath {
  if (explicit) return explicit
  if (pathname.startsWith('/dashboard/merchant')) return '/dashboard/merchant'
  return '/dashboard/investor'
}

const DashboardSideNav = ({
  basePath: basePathProp,
  expanded,
  onToggleExpanded,
  onRequestClose,
}: DashboardSideNavProps) => {
  const dispatch = useAppDispatch()
  const isKycVerified = useAppSelector(selectIsKycVerified)
  const { logout } = useLogout()
  const { wallet } = useActiveWallet()
  const [loggingOut, setLoggingOut] = useState(false)
  const location = useLocation()
  const pathname = location.pathname

  const base = resolveDashboardBase(pathname, basePathProp)
  const showLabels = expanded
  const asideWidthClass = expanded ? 'w-[248px]' : 'w-[72px]'

  const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const isPoolHowItWorks = new RegExp(`^${escapedBase}/lending-pool/[^/]+/how-it-works$`).test(pathname)
  const isPoolDetailOnly = new RegExp(`^${escapedBase}/lending-pool/[^/]+$`).test(pathname)
  const isPoolNested = new RegExp(`^${escapedBase}/lending-pool/[^/]+/.+$`).test(pathname)

  const investorHowItWorks = base === '/dashboard/investor' && isPoolHowItWorks
  const investorPoolDetail = base === '/dashboard/investor' && isPoolDetailOnly
  const investorPoolAction = base === '/dashboard/investor' && isPoolNested && !isPoolHowItWorks
  const merchantPoolDetail = base === '/dashboard/merchant' && isPoolDetailOnly
  const role = base === '/dashboard/merchant' ? 'merchant' : 'investor'
  const homePath = dashboardHomePath(role, isKycVerified)
  const purpose = role === 'merchant' ? 'repayment' : 'deposit'
  const { transfers: bridgeTransfers } = useActiveBridgeTransfers({
    purpose,
    enabled: isKycVerified,
  })
  const transfersBadge = bridgeTransfers.some((row) => isActionableBridgeStatus(row.status))

  const overviewNavItem: DashboardSideNavItem = {
    path: `${base}/overview`,
    label: 'Dashboard',
    icon: squaresFourIcon,
    isActive:
      pathname === base ||
      pathname === `${base}/` ||
      pathname.startsWith(`${base}/overview`) ||
      investorHowItWorks ||
      merchantPoolDetail,
  }

  const opportunitiesNavItem: DashboardSideNavItem = {
    path: `${base}/opportunities`,
    label: 'Opportunities',
    icon: coinIcon,
    isActive: isKycVerified
      ? pathname.startsWith(`${base}/opportunities`) ||
        investorPoolDetail ||
        investorPoolAction ||
        investorHowItWorks ||
        merchantPoolDetail ||
        pathname === base ||
        pathname === `${base}/`
      : pathname.startsWith(`${base}/opportunities`) || investorPoolDetail || investorPoolAction,
  }

  const navItems: DashboardSideNavItem[] = [
    ...(isKycVerified ? [] : [overviewNavItem]),
    opportunitiesNavItem,
    {
      path: `${base}/profile/overview`,
      label: 'Profile',
      icon: userIcon,
      isActive: pathname.startsWith(`${base}/profile`) && !pathname.startsWith(`${base}/profile/wallets`),
    },
  ]

  const merchantExtraItems: DashboardSideNavItem[] =
    base === '/dashboard/merchant'
      ? [
          {
            path: `${base}/receivables`,
            label: 'Receivables',
            icon: documentNavIcon,
            isActive: pathname.startsWith(`${base}/receivables`),
          },
        ]
      : []

  const transfersNavItem: DashboardSideNavItem = {
    path: trackerListPathForPurpose(purpose),
    label: 'Bridge transactions',
    icon: coinIcon,
    isActive: pathname.startsWith(`${base}/bridge`),
    badge: transfersBadge,
  }

  const supportItem: DashboardSideNavItem = {
    path: `${base}/support`,
    label: 'Support',
    icon: supportNavIcon,
    isActive: pathname === `${base}/support` || pathname.startsWith(`${base}/support/`),
  }

  const allNavItems = isKycVerified
    ? [
        opportunitiesNavItem,
        ...merchantExtraItems,
        transfersNavItem,
        navItems[navItems.length - 1],
        supportItem,
      ]
    : [...navItems.slice(0, 2), ...merchantExtraItems, ...navItems.slice(2), supportItem]

  const handleLogout = () => {
    if (loggingOut) return
    onRequestClose?.()
    setLoggingOut(true)
    void logoutUserSession(dispatch, wallet, logout).catch(() => {
      setLoggingOut(false)
    })
  }

  return (
    <aside
      className={`${asideWidthClass} shrink-0 bg-[#F3F3F3] border-r border-[#E6E8EC] flex flex-col h-dvh transition-[width] duration-200 ease-out overflow-hidden shadow-none`}
    >
      <div
        className={[
          'flex flex-col pt-4 pb-2 px-2',
          expanded ? 'items-stretch' : 'items-center',
        ].join(' ')}
      >
        {onRequestClose ? (
          <div className="w-full flex justify-end px-2 mb-1">
            <button
              type="button"
              onClick={onRequestClose}
              aria-label="Close navigation menu"
              className="h-[32px] w-[32px] rounded-[6px] flex items-center justify-center text-[#4D5D80] hover:bg-black/5"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M18 6 6 18" />
                <path d="M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : null}

        <Link
          to={homePath}
          onClick={() => onRequestClose?.()}
          className={[
            'flex items-center gap-3 w-full px-2 py-1 rounded-[6px] mt-1',
            expanded ? '' : 'justify-center',
          ].join(' ')}
          aria-label="Dashboard home"
        >
          <img src={logo} alt="" className={LOGO_HEADER} />
          {showLabels ? (
            <span className="text-[#0B1220] font-bold text-[15px] truncate">Fist Commerce</span>
          ) : null}
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-1 min-h-0" aria-label="Dashboard">
        {allNavItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            onClick={() => onRequestClose?.()}
            aria-label={item.badge ? `${item.label}, activity` : item.label}
            aria-current={item.isActive ? 'page' : undefined}
            className={[
              'flex items-center gap-3 rounded-[6px] px-3 py-3 text-left transition-colors w-full',
              item.isActive ? 'bg-[#E8EFFB] text-[#195EBC]' : 'bg-transparent text-[#6B7488]',
            ].join(' ')}
          >
            <span className="relative h-[24px] w-[24px] shrink-0 flex items-center justify-center">
              {item.path.endsWith('/bridge') ? (
                <TransfersNavIcon
                  className={[
                    ICON_24,
                    item.isActive ? 'text-[#195EBC]' : 'text-[#6B7488]',
                  ].join(' ')}
                />
              ) : (
                <img
                  src={item.icon}
                  alt=""
                  className={[
                    ICON_24,
                    item.isActive ? 'dashboard-nav-icon-active' : 'dashboard-nav-icon-inactive',
                  ].join(' ')}
                />
              )}
              {item.badge ? (
                <span
                  className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[#F97316] ring-2 ring-[#F3F3F3]"
                  aria-hidden
                />
              ) : null}
            </span>
            <span
              className={[
                'text-[14px] font-medium truncate transition-opacity duration-200',
                showLabels ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0 overflow-hidden',
              ].join(' ')}
            >
              {item.label}
            </span>
          </Link>
        ))}
      </nav>

      <div className="p-3 border-t border-[#E6E8EC] flex flex-col gap-2">
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className={[
            'flex items-center gap-3 rounded-[6px] px-3 py-3 text-left transition-colors w-full',
            'text-[#6B7488] hover:bg-[#FEF2F2] hover:text-[#DC2626] disabled:opacity-60',
          ].join(' ')}
          aria-label="Log out"
        >
          <span className="h-[24px] w-[24px] shrink-0 flex items-center justify-center text-[#6B7488]">
            <DashboardLogoutIcon className="w-[24px] h-[24px]" />
          </span>
          <span
            className={[
              'text-[14px] font-medium truncate transition-opacity duration-200',
              showLabels ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0 overflow-hidden',
            ].join(' ')}
          >
            {loggingOut ? 'Logging out…' : 'Log out'}
          </span>
        </button>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onToggleExpanded}
            className="h-10 w-10 rounded-full border border-[#195EBC] flex items-center justify-center text-[#195EBC] hover:bg-[#E8EFFB] transition-colors"
            aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <img
              src={collapseArrowIcon}
              alt=""
              className={[ICON_24, 'transition-transform duration-200', expanded ? 'rotate-180' : ''].join(' ')}
            />
          </button>
        </div>
      </div>
    </aside>
  )
}

export default DashboardSideNav
