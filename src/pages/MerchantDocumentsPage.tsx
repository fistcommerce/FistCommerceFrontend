import { useMemo } from 'react'

import InvestorPoolDocumentsContent from '@/components/dashboard/investor/documents/InvestorPoolDocumentsContent'
import DashboardLayout, { type DashboardBreadcrumbItem } from '@/layouts/DashboardLayout'
import { useAppSelector } from '@/store/hooks'
import { selectMerchantWalletDisplay } from '@/store/selectors/merchantDashboardSelectors'
import { selectIsKycVerified } from '@/store/selectors/sessionSelectors'
import { dashboardHomePath } from '@/utils/userRole'

export default function MerchantDocumentsPage() {
  const isKycVerified = useAppSelector(selectIsKycVerified)
  const walletDisplay = useAppSelector(selectMerchantWalletDisplay)

  const topBarBreadcrumbs = useMemo(
    (): DashboardBreadcrumbItem[] => [
      { label: 'Dashboard', to: dashboardHomePath('merchant', isKycVerified) },
      { label: 'Documents' },
    ],
    [isKycVerified],
  )

  return (
    <DashboardLayout
      dashboardBasePath="/dashboard/merchant"
      topBarBreadcrumbs={topBarBreadcrumbs}
      topBarWalletDisplay={walletDisplay}
    >
      <InvestorPoolDocumentsContent audience="merchant" />
    </DashboardLayout>
  )
}
