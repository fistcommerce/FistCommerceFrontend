import { useMemo } from 'react'

import InvestorPoolDocumentsContent from '@/components/dashboard/investor/documents/InvestorPoolDocumentsContent'
import DashboardLayout, { type DashboardBreadcrumbItem } from '@/layouts/DashboardLayout'
import { useAppSelector } from '@/store/hooks'
import { selectInvestorWalletDisplay } from '@/store/selectors/investorDashboardSelectors'
import { selectIsKycVerified } from '@/store/selectors/sessionSelectors'
import { dashboardHomePath } from '@/utils/userRole'

export default function InvestorPoolDocumentsPage() {
  const isKycVerified = useAppSelector(selectIsKycVerified)
  const walletDisplay = useAppSelector(selectInvestorWalletDisplay)

  const topBarBreadcrumbs = useMemo(
    (): DashboardBreadcrumbItem[] => [
      { label: 'Dashboard', to: dashboardHomePath('investor', isKycVerified) },
      { label: 'Pool documents' },
    ],
    [isKycVerified],
  )

  return (
    <DashboardLayout
      dashboardBasePath="/dashboard/investor"
      topBarBreadcrumbs={topBarBreadcrumbs}
      topBarWalletDisplay={walletDisplay}
    >
      <InvestorPoolDocumentsContent />
    </DashboardLayout>
  )
}
