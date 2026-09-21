import type { ReactNode } from 'react'

/** Root segment for side nav + internal dashboard links (merchant vs investor). */
export type DashboardBasePath = '/dashboard/merchant' | '/dashboard/investor'

export type DashboardBreadcrumbItem = {
  label: string
  /** Omit `to` for the current (non-link) segment */
  to?: string
}

export type DashboardLayoutProps = {
  children: ReactNode
  /** Plain title when you are not using `topBarBreadcrumbs` */
  topBarTitle?: string
  /** Breadcrumb trail in the top bar (link tree). Takes precedence over `topBarTitle` when non-empty. */
  topBarBreadcrumbs?: DashboardBreadcrumbItem[]
  /** Which dashboard the user is in — drives side nav targets. Falls back to URL when omitted. */
  dashboardBasePath?: DashboardBasePath
  /** Investor pool detail: grey breadcrumb links instead of blue */
  topBarBreadcrumbLinksMuted?: boolean
  /** When set, header shows connected wallet chip instead of “Connect Wallet” */
  topBarWalletDisplay?: string
  /** Orange unread dot on notification bell */
  topBarNotificationUnread?: boolean
}

export type DashboardTopBarProps = {
  title?: string
  breadcrumbs?: DashboardBreadcrumbItem[]
  /** Grey breadcrumb links (investor pool detail spec) */
  breadcrumbLinksMuted?: boolean
  /** Truncated address — when set, shows wallet chip instead of Connect Wallet */
  walletDisplay?: string
  /** Orange unread indicator on notifications */
  notificationUnread?: boolean
  /** Shows the hamburger button on small screens */
  onMenuClick?: () => void
  menuButtonAriaLabel?: string
}

export type DashboardBellIconProps = {
  className?: string
}

/** Internal nav row after resolving active state (DashboardSideNav). */
export type DashboardSideNavItem = {
  path: string
  label: string
  icon: string
  isActive: boolean
  /** Small unread/status dot on the icon */
  badge?: boolean
}

export type DashboardSideNavProps = {
  basePath?: DashboardBasePath
  expanded: boolean
  onToggleExpanded: () => void
  /** When provided, renders a close button (useful for mobile drawer). */
  onRequestClose?: () => void
}

export type KycVerificationCardVariant = 'investor' | 'merchant'

export type KycVerificationCardProps = {
  variant?: KycVerificationCardVariant
  /** When omitted, derived from GET KYC snapshot in Redux (`verification_url`, verified flags, wallet). */
  hasStartedKyc?: boolean
  /** Default not-started flow: 2 steps (investor) or 3 (merchant); in-progress uses 1 or 2 from snapshot. */
  totalSteps?: number
  currentStepNumber?: number
  currentStepName?: string
}

export type DashboardKycGateProps = {
  isKycVerified: boolean
  kycVariant: KycVerificationCardVariant
  verifiedContent: ReactNode
}

export type DashboardBorderedPanelProps = {
  title: string
  titleAs?: 'h2' | 'h3'
  children: ReactNode
  className?: string
  /** Extra classes on the white bordered container */
  panelClassName?: string
}

export type LendingPoolOpportunityCardProps = {
  /** Merchant: navigate to loan detail route when set */
  viewDetailsTo?: string
  poolTitle?: string
  tagline?: string
  apyDisplay?: string
  tvlDisplay?: string
  liquidAssetsDisplay?: string
  outstandingDisplay?: string
  availableLiquidityDisplay?: string
  minDepositDisplay?: string
  utilizationDisplay?: string
}

export type MerchantLendingPoolProps = {
  /** e.g. "538,500" — format as needed from API */
  totalDepositsDisplay?: string
}

export type DashboardSectionTitleProps = {
  children: ReactNode
  as?: 'h2' | 'h3'
  className?: string
}
