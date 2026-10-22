import { useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import AdminFetchErrorModal from '@/components/admin/AdminFetchErrorModal'
import AdminSideNav from '@/components/admin/AdminSideNav'
import AdminTopBar from '@/components/admin/AdminTopBar'
import DashboardErrorModal from '@/components/dashboard/shared/DashboardErrorModal'
import { getAppChainDisplayName } from '@/contract_config/contractNetwork'
import { useConnectWalletAction } from '@/hooks/useConnectWalletAction'
import { useWallet } from '@/hooks/useWallet'
import { useAppSelector } from '@/store/hooks'
import { AdminMerchantProfileBreadcrumb } from '@/components/admin/merchants'
import {
  AdminInvestorActivityDetailBreadcrumb,
  AdminInvestorProfileBreadcrumb,
} from '@/components/admin/investors/profile'

const ADMIN_INVESTORS_LIST_PATH = '/dashboard/admin/investors'
const ADMIN_MERCHANTS_LIST_PATH = '/dashboard/admin/merchants'
const isAdminInvestorProfilePath = (path: string) => /^\/dashboard\/admin\/investors\/[^/]+$/.test(path)
const isAdminMerchantProfilePath = (path: string) => /^\/dashboard\/admin\/merchants\/[^/]+$/.test(path)
const isAdminLoanMonitoringDetailPath = (path: string) =>
  /^\/dashboard\/admin\/loan-monitoring\/[^/]+$/.test(path)

const adminInvestorActivityDetailMatch = (path: string) =>
  path.match(/^\/dashboard\/admin\/investors\/([^/]+)\/activity\/([^/]+)$/)

const TITLE_BY_SEGMENT: Record<string, string> = {
  overview: 'Platform Overview',
  governance: 'Governance Queue',
  'payout-withdrawals': 'Payout & Withdrawal Management',
  receivables: 'Receivables Management',
  'evidence-register': 'Merchant Evidence Register',
  merchants: 'Merchants Management',
  investors: 'Investors Management',
  'loan-monitoring': 'Loan Monitoring',
  transactions: 'Transactions',
  settlements: 'Settlements',
  support: 'Support and Dispute Info',
  settings: 'Settings',
}

const AdminDashboardLayout = () => {
  const { pathname } = useLocation()
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    setMobileNavOpen(false)
  }, [pathname])

  const pageTitle = useMemo(() => {
    if (pathname.includes('/dashboard/admin/governance/') && pathname !== '/dashboard/admin/governance') {
      return 'Governance Proposal'
    }
    if (pathname === '/dashboard/admin/governance') return TITLE_BY_SEGMENT.governance
    if (pathname.includes('/dashboard/admin/receivables/') && !pathname.endsWith('/receivables')) {
      return 'Receivable Details'
    }
    if (pathname === '/dashboard/admin/receivables') return TITLE_BY_SEGMENT.receivables
    if (adminInvestorActivityDetailMatch(pathname)) return 'Investment Details'
    if (isAdminMerchantProfilePath(pathname)) return 'Merchant Profile'
    if (isAdminLoanMonitoringDetailPath(pathname)) return 'Loan Details'
    const parts = pathname.split('/').filter(Boolean)
    if (parts[2] === 'investors' && parts[3]) return 'Investor Profile'
    const seg = parts[parts.length - 1] ?? 'overview'
    return TITLE_BY_SEGMENT[seg] ?? 'Admin'
  }, [pathname])

  const topBarLeading = useMemo(() => {
    const activityMatch = adminInvestorActivityDetailMatch(pathname)
    if (activityMatch) {
      const investorId = activityMatch[1] ?? ''
      return (
        <AdminInvestorActivityDetailBreadcrumb
          listHref={ADMIN_INVESTORS_LIST_PATH}
          profileHref={`/dashboard/admin/investors/${investorId}`}
        />
      )
    }
    if (isAdminMerchantProfilePath(pathname)) {
      return <AdminMerchantProfileBreadcrumb listHref={ADMIN_MERCHANTS_LIST_PATH} />
    }
    if (isAdminInvestorProfilePath(pathname)) {
      return <AdminInvestorProfileBreadcrumb listHref={ADMIN_INVESTORS_LIST_PATH} />
    }
    return undefined
  }, [pathname])

  const menuButtonLabel = mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'
  const { shortAddress } = useWallet()
  const walletChainId = useAppSelector((s) => s.wallet.chainId)
  const authChainId = useAppSelector((s) => s.auth.chainId)
  const networkDisplayName = getAppChainDisplayName(walletChainId ?? authChainId)
  const {
    connect: connectWallet,
    pending: connectWalletPending,
    error: connectWalletError,
    clearError: clearConnectWalletError,
  } = useConnectWalletAction()

  return (
    <main className="h-dvh w-full bg-[#EEF0F4] flex overflow-hidden">
      <AdminFetchErrorModal />
      <DashboardErrorModal
        open={Boolean(connectWalletError)}
        title="Could not connect wallet"
        message={connectWalletError ?? ''}
        onClose={clearConnectWalletError}
        onRetry={() => void connectWallet()}
        retryLabel="Try again"
      />
      <div className="hidden lg:flex shrink-0">
        <AdminSideNav
          expanded={sidebarExpanded}
          onToggleExpanded={() => setSidebarExpanded((v) => !v)}
        />
      </div>

      {mobileNavOpen ? (
        <div className="lg:hidden fixed inset-0 z-60">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileNavOpen(false)} aria-hidden />
          <div className="absolute left-0 top-0 bottom-0">
            <AdminSideNav
              expanded
              onToggleExpanded={() => setSidebarExpanded((v) => !v)}
              onRequestClose={() => setMobileNavOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div className="flex-1 flex flex-col min-w-0">
        <AdminTopBar
          title={pageTitle}
          leading={topBarLeading}
          walletDisplay={shortAddress ?? undefined}
          networkDisplayName={networkDisplayName}
          onConnectWallet={() => void connectWallet()}
          connectWalletPending={connectWalletPending}
          onMenuClick={() => setMobileNavOpen((v) => !v)}
          menuButtonAriaLabel={menuButtonLabel}
        />

        {topBarLeading ? null : (
          <h1 className="lg:hidden shrink-0 px-4 sm:px-6 lg:px-8 pt-4 text-black font-semibold text-[18px] leading-tight">
            {pageTitle}
          </h1>
        )}

        <div className="px-4 sm:px-6 lg:px-8 py-6 overflow-y-auto flex-1 min-h-0">
          <Outlet />
        </div>
      </div>
    </main>
  )
}

export default AdminDashboardLayout
