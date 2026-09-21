import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'

import DashboardSideNav from '@/components/dashboard/shared/DashboardSideNav'
import DashboardTopBar from '@/components/dashboard/shared/DashboardTopBar'
import BridgeStatusNotice from '@/components/bridge/BridgeStatusNotice'
import { useWallet } from '@/hooks/useWallet'

import type { DashboardLayoutProps } from '@/components/dashboard/shared/types'

export type {
  DashboardBasePath,
  DashboardBreadcrumbItem,
  DashboardLayoutProps,
} from '@/components/dashboard/shared/types'

const DashboardLayout = ({
  children,
  topBarTitle,
  topBarBreadcrumbs,
  dashboardBasePath,
  topBarBreadcrumbLinksMuted,
  topBarWalletDisplay,
  topBarNotificationUnread,
}: DashboardLayoutProps) => {
  const { pathname } = useLocation()
  const [isNavOpen, setIsNavOpen] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(false)

  useEffect(() => {
    setIsNavOpen(false)
  }, [pathname])

  const menuButtonLabel = useMemo(
    () => (isNavOpen ? 'Close navigation menu' : 'Open navigation menu'),
    [isNavOpen],
  )

  const { shortAddress } = useWallet()
  const effectiveWalletDisplay = shortAddress ?? topBarWalletDisplay

  return (
    <main className="h-dvh w-full bg-[#EEF0F4] flex overflow-hidden">
      <div className="hidden lg:flex shrink-0">
        <DashboardSideNav
          basePath={dashboardBasePath}
          expanded={sidebarExpanded}
          onToggleExpanded={() => setSidebarExpanded((v) => !v)}
        />
      </div>

      {isNavOpen ? (
        <div className="lg:hidden fixed inset-0 z-60">
          <div className="absolute inset-0 bg-black/30" onClick={() => setIsNavOpen(false)} aria-hidden />
          <div className="absolute left-0 top-0 bottom-0">
            <DashboardSideNav
              basePath={dashboardBasePath}
              expanded
              onToggleExpanded={() => setSidebarExpanded((v) => !v)}
              onRequestClose={() => setIsNavOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar
          title={topBarTitle}
          breadcrumbs={topBarBreadcrumbs}
          breadcrumbLinksMuted={topBarBreadcrumbLinksMuted}
          walletDisplay={effectiveWalletDisplay}
          notificationUnread={topBarNotificationUnread}
          onMenuClick={() => setIsNavOpen((v) => !v)}
          menuButtonAriaLabel={menuButtonLabel}
        />
        <BridgeStatusNotice />

        <div className="px-4 sm:px-8 py-6 sm:py-8 overflow-y-auto flex-1 min-h-0">
          <div className="max-w-[1120px] mx-auto flex flex-col gap-4 min-w-0 w-full">
            {children}
          </div>
        </div>
      </div>
    </main>
  )
}

export default DashboardLayout
