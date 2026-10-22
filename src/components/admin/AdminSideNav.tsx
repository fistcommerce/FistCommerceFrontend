import { useState } from 'react'
import { NavLink } from 'react-router-dom'

import logo from '@/assets/logo.png'
import collapseArrowIcon from '@/assets/CollapseArrow.svg'
import squaresFourIcon from '@/assets/SquaresFour.svg'
import adminSidebarDocument from '@/assets/admin-sidebar-document.png'
import userIcon from '@/assets/ph_user.svg'
import coinIcon from '@/assets/Coin.svg'
import adminSidebarMoney from '@/assets/admin-sidebar-money.png'
import adminIconTransactions from '@/assets/admin-icon-transactions.png'
import adminIconSupport from '@/assets/admin-icon-support.png'
import adminIconSettings from '@/assets/admin-icon-settings.png'

import { useAppDispatch } from '@/store/hooks'
import { logoutAdminSession } from '@/session/logoutAdminSession'

import type { AdminNavItem, AdminSideNavProps } from './types'

const basePath = '/dashboard/admin'

/** All sidebar icons render at 24×24 CSS pixels */
const ICON_24 = 'w-[24px] h-[24px] max-w-[24px] max-h-[24px] object-contain shrink-0'

/** Header logo — 45×40 */
const LOGO_HEADER = 'w-[45px] h-[40px] max-w-[45px] max-h-[40px] object-contain shrink-0'

/**
 * Single `filter` string so steps are not overridden (multiple Tailwind `brightness-*`
 * utilities collapse to one property and break the black → #195EBC tint pipeline).
 */
const ICON_ACTIVE_FILTER_CSS =
  'brightness(0) saturate(100%) invert(31%) sepia(98%) saturate(2618%) hue-rotate(200deg) brightness(97%) contrast(96%)'

function AdminLogoutIcon({ className }: { className?: string }) {
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

const NAV_ITEMS: AdminNavItem[] = [
  { to: `${basePath}/overview`, label: 'Dashboard', iconSrc: squaresFourIcon, iconAlwaysBrandBlue: true },
  { to: `${basePath}/governance`, label: 'Governance', iconSrc: adminIconTransactions },
  { to: `${basePath}/payout-withdrawals`, label: 'Payout & Withdrawals', iconSrc: adminSidebarDocument },
  { to: `${basePath}/merchants`, label: 'Merchants', iconSrc: userIcon },
  { to: `${basePath}/investors`, label: 'Investors', iconSrc: coinIcon },
  { to: `${basePath}/loan-monitoring`, label: 'Loan Monitoring', iconSrc: adminSidebarMoney },
  { to: `${basePath}/receivables`, label: 'Receivables', iconSrc: adminSidebarDocument },
  { to: `${basePath}/evidence-register`, label: 'Evidence Register', iconSrc: adminSidebarDocument },
  { to: `${basePath}/transactions`, label: 'Transactions', iconSrc: adminIconTransactions },
  { to: `${basePath}/support`, label: 'Support and Dispute Info', iconSrc: adminIconSupport },
  { to: `${basePath}/settings`, label: 'Settings', iconSrc: adminIconSettings },
]

const AdminSideNav = ({ expanded, onToggleExpanded, onRequestClose }: AdminSideNavProps) => {
  const dispatch = useAppDispatch()
  const [loggingOut, setLoggingOut] = useState(false)
  const showLabels = expanded
  const asideWidthClass = expanded ? 'w-[248px]' : 'w-[72px]'

  const handleLogout = () => {
    if (loggingOut) return
    onRequestClose?.()
    setLoggingOut(true)
    void logoutAdminSession(dispatch).catch(() => {
      setLoggingOut(false)
    })
  }

  return (
    <aside
      className={`${asideWidthClass} shrink-0 bg-white border-r border-[#E6E8EC] flex flex-col h-dvh transition-[width] duration-200 ease-out overflow-hidden`}
    >
      <div className="flex flex-col items-center pt-4 pb-2 px-2">
        <NavLink
          to={`${basePath}/overview`}
          className="flex items-center gap-3 w-full px-2 py-1 rounded-[6px] bg-transparent"
          onClick={() => onRequestClose?.()}
          aria-label="Admin home"
        >
          <img src={logo} alt="" className={LOGO_HEADER} />
          {showLabels ? (
            <span className="text-[#0B1220] font-bold text-[15px] truncate">Fist Commerce</span>
          ) : null}
        </NavLink>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-1 min-h-0" aria-label="Admin">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => onRequestClose?.()}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 rounded-[6px] px-3 py-3 text-left transition-colors',
                isActive ? 'bg-[#F3F7FC]' : 'bg-transparent',
              ].join(' ')
            }
          >
            {({ isActive }) => {
              const showActiveTint = isActive && !item.iconAlwaysBrandBlue
              const iconMutedInactive = !item.iconAlwaysBrandBlue && !isActive
              return (
              <>
                <span className="h-[24px] w-[24px] shrink-0 bg-transparent flex items-center justify-center">
                  <img
                    src={item.iconSrc}
                    alt=""
                    className={[ICON_24, iconMutedInactive ? 'opacity-90' : ''].filter(Boolean).join(' ')}
                    style={showActiveTint ? { filter: ICON_ACTIVE_FILTER_CSS } : undefined}
                  />
                </span>
                <span
                  className={[
                    'text-[14px] font-medium truncate transition-opacity duration-200',
                    isActive ? 'text-[#195EBC]' : 'text-[#6B7488]',
                    showLabels ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0 overflow-hidden',
                  ].join(' ')}
                >
                  {item.label}
                </span>
              </>
              )
            }}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-[#EDF0F4] flex flex-col gap-2">
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
            <AdminLogoutIcon className="w-[24px] h-[24px]" />
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

export default AdminSideNav
