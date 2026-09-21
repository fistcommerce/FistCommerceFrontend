import type { ReactNode } from 'react'

import {
  DashboardOverviewRoute,
  DashboardRoleFallbackRedirect,
  DashboardRoleIndexRedirect,
} from '@/components/session/DashboardOverviewRoute'
import InvestorDashboardSessionLayout from '@/components/session/InvestorDashboardSessionLayout'
import KycFinancialRoutesGuard from '@/components/session/KycFinancialRoutesGuard'
import MerchantDashboardSessionLayout from '@/components/session/MerchantDashboardSessionLayout'
import AdminDashboardSessionLayout from '@/components/session/AdminDashboardSessionLayout'
import { Navigate, Outlet, RouterProvider, createBrowserRouter, useLocation } from 'react-router-dom'

import { useAppSelector } from '@/store/hooks'
import { useActiveWallet } from '@/wallet/useActiveWallet'
import OnboardingPage from '@/pages/OnboardingPage'
import OnboardingCompleted, { OnboardingCompletedVariant } from '@/pages/OnboardingCompleted'
import MerchantLayout from '@/layouts/MerchantOnboardingLayout'
import InvestorLayout from '@/layouts/InvestorOnboardingLayout'

import ChooseRole from '@/components/onboarding/onboarding-steps/ChooseRole'
import ConnectWallet from '@/components/onboarding/onboarding-steps/ConnectWallet'
import SecureYourKey from '@/components/onboarding/onboarding-steps/SecureYourKey'
import SecureKeyOnboardingGate from '@/components/session/SecureKeyOnboardingGate'
import InvestorRegistration from '@/components/onboarding/onboarding-steps/investor/InvestorRegistration'
import InvestmentExplainer from '@/components/onboarding/onboarding-steps/investor/InvestmentExplainer'
import MerchantIdVerification from '@/components/onboarding/onboarding-steps/merchant/MerchantIdVerification'
import BusinessProfile from '@/components/onboarding/onboarding-steps/merchant/BusinessProfileVerification'
import PageNotFound from '@/pages/404'
import DashboardPage from './pages/InvestorDashboardPage'
import MerchantDashboardPage from './pages/MerchantDashboardPage'
import MerchantLoanDetailPage from './pages/MerchantLoanDetailPage'
import InvestorLendingPoolDetailPage from './pages/InvestorLendingPoolDetailPage'
import InvestorLendingPoolHowItWorksPage from './pages/InvestorLendingPoolHowItWorksPage'
import InvestorInvestWithdrawPage from './pages/InvestorInvestWithdrawPage'
import BridgeActivityPage from '@/pages/BridgeActivityPage'
import InvestorProfileOverviewPage from './pages/InvestorProfileOverviewPage'
import InvestorProfileOverviewTabContent from '@/components/dashboard/investor/profile/InvestorProfileOverviewTabContent'
import InvestorProfileWalletsTabContent from '@/components/dashboard/investor/profile/InvestorProfileWalletsTabContent'
import InvestorProfileHistoryTabContent from '@/components/dashboard/investor/profile/InvestorProfileHistoryTabContent'
import MerchantProfileOverviewPage from '@/pages/MerchantProfileOverviewPage'
import MerchantProfileOverviewTabContent from '@/components/dashboard/merchant/profile/MerchantProfileOverviewTabContent'
import MerchantApplyLoanPage from './pages/MerchantApplyLoanPage'
import MerchantApplyLoanSuccessPage from './pages/MerchantApplyLoanSuccessPage'
import MerchantApplyLoanFailurePage from './pages/MerchantApplyLoanFailurePage'
import MerchantProfileActivitiesTabContent from '@/components/dashboard/merchant/profile/MerchantProfileActivitiesTabContent'
import MerchantReceivableDetailPage from '@/pages/MerchantReceivableDetailPage'
import MerchantRepayLoanPage from '@/pages/MerchantRepayLoanPage'
import MerchantRepayLoanConfirmationPage from '@/pages/MerchantRepayLoanConfirmationPage'
import MerchantRepayLoanFailurePage from '@/pages/MerchantRepayLoanFailurePage'
import DashboardSupportContactPage from '@/pages/DashboardSupportContactPage'
import AdminDashboardLayout from '@/layouts/AdminDashboardLayout'
import AdminPlatformOverviewPage from '@/pages/AdminPlatformOverviewPage'
import AdminPayoutWithdrawalManagementPage from '@/pages/AdminPayoutWithdrawalManagementPage'
import AdminReceivableDetailPage from '@/pages/AdminReceivableDetailPage'
import AdminReceivableApprovedPage from '@/pages/AdminReceivableApprovedPage'
import AdminReceivablesManagementPage from '@/pages/AdminReceivablesManagementPage'
import AdminMerchantProfilePage from '@/pages/AdminMerchantProfilePage'
import AdminMerchantsManagementPage from '@/pages/AdminMerchantsManagementPage'
import AdminInvestorsManagementPage from '@/pages/AdminInvestorsManagementPage'
import AdminGovernanceProposalDetailPage from '@/pages/AdminGovernanceProposalDetailPage'
import AdminGovernanceQueuePage from '@/pages/AdminGovernanceQueuePage'
import AdminLoanMonitoringDetailPage from '@/pages/AdminLoanMonitoringDetailPage'
import AdminLoanMonitoringPage from '@/pages/AdminLoanMonitoringPage'
import AdminSectionPlaceholderPage from '@/pages/AdminSectionPlaceholderPage'
import AdminTransactionsPage from '@/pages/AdminTransactionsPage'
import AdminSettingsPage from '@/pages/AdminSettingsPage'
import AdminSupportDisputeInfoPage from '@/pages/AdminSupportDisputeInfoPage'
import AdminInvestorActivityDetailPage from '@/pages/AdminInvestorActivityDetailPage'
import AdminInvestorProfilePage from '@/pages/AdminInvestorProfilePage'
import AdminLoginPage from '@/pages/AdminLoginPage'
import AdminProtectedOutlet from '@/components/session/AdminProtectedOutlet'
import LandingPage from '@/pages/LandingPage'
import AppShell from '@/layouts/AppShell'
import RouteErrorFallback from '@/components/app/RouteErrorFallback'
import { resolveDashboardReturnTo } from '@/session/dashboardReturnTo'
import { parseUserRole } from '@/utils/userRole'
import { isUsableApiAccessToken } from '@/auth/accessTokenPolicy'
import {
  ADMIN_DASHBOARD_OVERVIEW_PATH,
  ADMIN_LOGIN_PATH,
  isAdminDashboardPath,
  isAdminSession,
} from '@/auth/adminSession'

const RootRedirect = () => {
  const { onboarded, role, accessToken, sessionKind, sessionExpired } = useAppSelector((s) => s.auth)
  const { isConnected } = useActiveWallet()
  const normalizedRole = parseUserRole(role)
  if (isAdminSession(accessToken, sessionKind)) {
    return <Navigate to={ADMIN_DASHBOARD_OVERVIEW_PATH} replace />
  }
  if (sessionKind === 'admin') {
    return <Navigate to={ADMIN_LOGIN_PATH} replace />
  }
  if (sessionExpired) {
    if (!normalizedRole) return <Navigate to="/onboarding/choose-role" replace />
    return <Navigate to={`/onboarding/${normalizedRole}/connect-wallet`} replace />
  }
  if (!onboarded) return <Navigate to="/onboarding" replace />
  if (!isConnected || !isUsableApiAccessToken(accessToken)) {
    if (!normalizedRole) return <Navigate to="/onboarding/choose-role" replace />
    return <Navigate to={`/onboarding/${normalizedRole}/connect-wallet`} replace />
  }
  if (!normalizedRole) return <Navigate to="/onboarding/choose-role" replace />
  return <Navigate to={resolveDashboardReturnTo(normalizedRole)} replace />
}

const RequireOnboarded = ({ children }: { children: ReactNode }) => {
  const { onboarded, sessionExpired } = useAppSelector((s) => s.auth)
  // Keep the current dashboard route mounted so SessionExpiredModal can own recovery.
  if (sessionExpired) return <>{children}</>
  if (!onboarded) return <Navigate to="/onboarding/choose-role" replace />
  return <>{children}</>
}

/** Admin dashboard uses its own login; do not require wallet onboarding for `/dashboard/admin`. */
const RequireOnboardedOutlet = () => {
  const { pathname } = useLocation()
  if (isAdminDashboardPath(pathname) || pathname === '/dashboard/admin/login') {
    return <Outlet />
  }
  return (
    <RequireOnboarded>
      <Outlet />
    </RequireOnboarded>
  )
}

const DashboardIndexRedirect = () => {
  const { accessToken, sessionKind } = useAppSelector((s) => s.auth)
  if (isAdminSession(accessToken, sessionKind)) {
    return <Navigate to={ADMIN_DASHBOARD_OVERVIEW_PATH} replace />
  }
  if (sessionKind === 'admin') {
    return <Navigate to={ADMIN_LOGIN_PATH} replace />
  }
  return <Navigate to="investor" replace />
}

const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <RouteErrorFallback />,
    children: [
  {
    path: '/',
    element: <LandingPage />,
  },
  {
    path: '/continue',
    element: <RootRedirect />,
  },
  {
    path: '/admin/login',
    element: <AdminLoginPage />,
  },
  {
    path: '/onboarding',
    element: <OnboardingPage />,
    children: [
      {
        index: true,
        element: <Navigate to="/onboarding/choose-role" replace />,
      },
      {
        path: 'choose-role',
        element: <InvestorLayout />,
        children: [{ index: true, element: <ChooseRole /> }],
      },
      {
        path: 'merchant',
        element: <MerchantLayout />,
        children: [
          {
            path: 'connect-wallet',
            element: <ConnectWallet />
          },
          {
            path: 'secure-key',
            element: <SecureYourKey />
          },
          {
            path: 'verify-identity',
            element: (
              <SecureKeyOnboardingGate role="merchant">
                <MerchantIdVerification />
              </SecureKeyOnboardingGate>
            )
          },
          {
            path: 'business-profile',
            element: <BusinessProfile />
          },
          {
            path: '*',
            element: <Navigate to="/onboarding/choose-role" replace />,
          },
        ]
      },
      {
        path: 'investor',
        element: <InvestorLayout />,
        children: [
          {
            path: 'connect-wallet',
            element: <ConnectWallet />
          },
          {
            path: 'secure-key',
            element: <SecureYourKey />
          },
          {
            path: 'verify-identity',
            element: (
              <SecureKeyOnboardingGate role="investor">
                <InvestorRegistration />
              </SecureKeyOnboardingGate>
            )
          },
          {
            path: 'investment-explainer',
            element: <InvestmentExplainer />
          },
          {
            path: '*',
            element: <Navigate to="/onboarding/choose-role" replace />,
          },
        ]
      },
      {
        path: '*',
        element: <PageNotFound />,
      }
    ]
  },
  {
    path: '/onboarding-completed',
    children: [
      {
        index: true,
        element: <Navigate to="investor" replace />,
      },
      {
        path: 'investor',
        element: <OnboardingCompleted variant={OnboardingCompletedVariant.Investor} />,
      },
      {
        path: 'merchant',
        element: <OnboardingCompleted variant={OnboardingCompletedVariant.Merchant} />,
      },
      {
        path: '*',
        element: <PageNotFound />,
      },
    ],
  },
  {
    path: '/dashboard',
    element: <RequireOnboardedOutlet />,
    children: [
      {
        index: true,
        element: <DashboardIndexRedirect />,
      },
      {
        path: 'investor',
        element: <InvestorDashboardSessionLayout />,
        children: [
          {
            index: true,
            element: <DashboardRoleIndexRedirect role="investor" />,
          },
          {
            path: 'overview',
            element: <DashboardOverviewRoute role="investor" />,
          },
          {
            path: 'opportunities',
            element: <DashboardPage />,
          },
          {
            path: 'profile',
            element: <InvestorProfileOverviewPage />,
            children: [
              {
                index: true,
                element: <Navigate to="overview" replace />,
              },
              {
                path: 'overview',
                element: <InvestorProfileOverviewTabContent />,
              },
              {
                path: 'wallets',
                element: <InvestorProfileWalletsTabContent />,
              },
              {
                path: 'history',
                element: <InvestorProfileHistoryTabContent />,
              },
            ],
          },
          {
            path: 'bridge/:transferId',
            element: (
              <KycFinancialRoutesGuard>
                <BridgeActivityPage role="investor" />
              </KycFinancialRoutesGuard>
            ),
          },
          {
            path: 'bridge',
            element: (
              <KycFinancialRoutesGuard>
                <BridgeActivityPage role="investor" />
              </KycFinancialRoutesGuard>
            ),
          },
          {
            path: 'lending-pool/:poolSlug/how-it-works',
            element: <InvestorLendingPoolHowItWorksPage />,
          },
          {
            path: 'lending-pool/:poolSlug/invest',
            element: (
              <KycFinancialRoutesGuard>
                <InvestorInvestWithdrawPage />
              </KycFinancialRoutesGuard>
            ),
          },
          {
            path: 'lending-pool/:poolSlug/withdraw',
            element: (
              <KycFinancialRoutesGuard>
                <InvestorInvestWithdrawPage />
              </KycFinancialRoutesGuard>
            ),
          },
          {
            path: 'lending-pool/:poolSlug/invest-withdraw',
            element: <Navigate to="../invest" replace />,
          },
          {
            path: 'lending-pool/:poolSlug',
            element: <InvestorLendingPoolDetailPage />,
          },
          {
            path: 'support',
            element: <DashboardSupportContactPage />,
          },
          {
            path: '*',
            element: <DashboardRoleFallbackRedirect role="investor" />,
          },
        ],
      },
      {
        path: 'admin',
        element: <Outlet />,
        children: [
          {
            path: 'login',
            element: <AdminLoginPage />,
          },
          {
            element: <AdminProtectedOutlet />,
            children: [
              {
                element: <AdminDashboardSessionLayout />,
                children: [
              {
                element: <AdminDashboardLayout />,
                children: [
              {
                index: true,
                element: <Navigate to="overview" replace />,
              },
              {
                path: 'governance/:proposalId',
                element: <AdminGovernanceProposalDetailPage />,
              },
              {
                path: 'governance',
                element: <AdminGovernanceQueuePage />,
              },
              {
                path: 'overview',
                element: <AdminPlatformOverviewPage />,
              },
              {
                path: 'payout-withdrawals',
                element: <AdminPayoutWithdrawalManagementPage />,
              },
              {
                path: 'receivables',
                element: <AdminReceivablesManagementPage />,
              },
              {
                path: 'receivables/:receivableId',
                element: <AdminReceivableDetailPage />,
              },
              {
                path: 'receivables/:receivableId/approved',
                element: <AdminReceivableApprovedPage />,
              },
              {
                path: 'merchants/:merchantId',
                element: <AdminMerchantProfilePage />,
              },
              {
                path: 'merchants',
                element: <AdminMerchantsManagementPage />,
              },
              {
                path: 'investors/:investorId/activity/:activityId',
                element: <AdminInvestorActivityDetailPage />,
              },
              {
                path: 'investors/:investorId',
                element: <AdminInvestorProfilePage />,
              },
              {
                path: 'investors',
                element: <AdminInvestorsManagementPage />,
              },
              {
                path: 'loan-monitoring/:loanId',
                element: <AdminLoanMonitoringDetailPage />,
              },
              {
                path: 'loan-monitoring',
                element: <AdminLoanMonitoringPage />,
              },
              {
                path: 'transactions',
                element: <AdminTransactionsPage />,
              },
              {
                path: 'settlements',
                element: <AdminSectionPlaceholderPage title="Settlements" />,
              },
              {
                path: 'support',
                element: <AdminSupportDisputeInfoPage />,
              },
              {
                path: 'settings',
                element: <AdminSettingsPage />,
              },
              {
                path: '*',
                element: <Navigate to="/dashboard/admin/overview" replace />,
              },
                ],
              },
                ],
              },
            ],
          },
        ],
      },
      {
        path: 'merchant',
        element: <MerchantDashboardSessionLayout />,
        children: [
          {
            index: true,
            element: <DashboardRoleIndexRedirect role="merchant" />,
          },
          {
            path: 'overview',
            element: <DashboardOverviewRoute role="merchant" />,
          },
          {
            path: 'opportunities',
            element: <MerchantDashboardPage />,
          },
          {
            path: 'bridge/:transferId',
            element: (
              <KycFinancialRoutesGuard>
                <BridgeActivityPage role="merchant" />
              </KycFinancialRoutesGuard>
            ),
          },
          {
            path: 'bridge',
            element: (
              <KycFinancialRoutesGuard>
                <BridgeActivityPage role="merchant" />
              </KycFinancialRoutesGuard>
            ),
          },
          {
            path: 'receivables/:receivableId/repay',
            element: (
              <KycFinancialRoutesGuard>
                <MerchantRepayLoanPage />
              </KycFinancialRoutesGuard>
            ),
          },
          {
            path: 'receivables/:receivableId/repay/confirm',
            element: (
              <KycFinancialRoutesGuard>
                <MerchantRepayLoanConfirmationPage />
              </KycFinancialRoutesGuard>
            ),
          },
          {
            path: 'receivables/:receivableId/repay/failure',
            element: (
              <KycFinancialRoutesGuard>
                <MerchantRepayLoanFailurePage />
              </KycFinancialRoutesGuard>
            ),
          },
          {
            path: 'receivables/:receivableId',
            element: <MerchantReceivableDetailPage />,
          },
          {
            path: 'receivables',
            element: <MerchantDashboardPage />,
          },
          {
            path: 'profile',
            element: <MerchantProfileOverviewPage />,
            children: [
              {
                index: true,
                element: <Navigate to="overview" replace />,
              },
              {
                path: 'overview',
                element: <MerchantProfileOverviewTabContent />,
              },
              {
                path: 'wallets',
                element: <InvestorProfileWalletsTabContent />,
              },
              {
                path: 'history',
                element: <MerchantProfileActivitiesTabContent />,
              },
            ],
          },
          {
            path: 'lending-pool/:poolSlug',
            element: <MerchantLoanDetailPage />,
          },
          {
            path: 'lending-pool/:poolSlug/apply-loan',
            element: (
              <KycFinancialRoutesGuard>
                <MerchantApplyLoanPage />
              </KycFinancialRoutesGuard>
            ),
          },
          {
            path: 'lending-pool/:poolSlug/apply-loan/success',
            element: (
              <KycFinancialRoutesGuard>
                <MerchantApplyLoanSuccessPage />
              </KycFinancialRoutesGuard>
            ),
          },
          {
            path: 'lending-pool/:poolSlug/apply-loan/failure',
            element: (
              <KycFinancialRoutesGuard>
                <MerchantApplyLoanFailurePage />
              </KycFinancialRoutesGuard>
            ),
          },
          {
            path: 'support',
            element: <DashboardSupportContactPage />,
          },
          {
            path: '*',
            element: <DashboardRoleFallbackRedirect role="merchant" />,
          },
        ],
      },
      {
        path: '*',
        element: <PageNotFound />,
      },
    ],
  },
  {
    path: '*',
    element: <PageNotFound />,
  },
    ],
  },
])

function App() {
  return <RouterProvider router={router} />
}

export default App
