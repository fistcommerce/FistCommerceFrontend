import { useCallback, useEffect, useMemo } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'

import {
  blockExplorerAddressUrl,
  getDefaultBlockExplorerBase,
  isExplorerLinkableAddress,
} from '@/api/payout'
import DashboardLayout, { type DashboardBreadcrumbItem } from '@/layouts/DashboardLayout'
import LendingPoolDetailPageContent from '@/components/dashboard/merchant/lending-pool-detail/LendingPoolDetailPageContent'
import { getLendingPoolDetailConfig } from '@/components/dashboard/merchant/lending-pool-detail/poolDetailConfig'
import { DASHBOARD_LIST_PAGE_SIZE } from '@/constants/listPagination'
import { useListPageState } from '@/hooks/useListPageState'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { selectIsKycVerified } from '@/store/selectors/sessionSelectors'
import {
  recentTransactionsListCacheKey,
  refreshRecentTransactions,
} from '@/store/slices/recentTransactionsSlice'
import { getListPaginationMeta, listPaginationOffset } from '@/utils/listPagination'
import { dashboardHomePath } from '@/utils/userRole'

const MerchantLoanDetailPage = () => {
  const dispatch = useAppDispatch()
  const { poolSlug } = useParams<{ poolSlug: string }>()
  const navigate = useNavigate()
  const config = getLendingPoolDetailConfig(poolSlug)
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const isKycVerified = useAppSelector(selectIsKycVerified)
  const recentTx = useAppSelector((s) => s.recentTransactions)
  const [page, setPage] = useListPageState([])

  const offset = listPaginationOffset(page)
  const pageQuery = useMemo(
    () => ({
      limit: DASHBOARD_LIST_PAGE_SIZE,
      offset,
    }),
    [offset],
  )
  const pageCacheKey = recentTransactionsListCacheKey(pageQuery)
  const hasPageCache = Object.prototype.hasOwnProperty.call(recentTx.resultsCache, pageCacheKey)

  const refreshRecentPage = useCallback(
    (background: boolean) => {
      void dispatch(
        refreshRecentTransactions({
          ...pageQuery,
          background,
        }),
      )
    },
    [dispatch, pageQuery],
  )

  useEffect(() => {
    if (!accessToken?.trim() || !isKycVerified) return
    refreshRecentPage(hasPageCache)
  }, [accessToken, isKycVerified, refreshRecentPage, hasPageCache])

  const paginationMeta = useMemo(
    () => getListPaginationMeta(recentTx.total, page),
    [recentTx.total, page],
  )

  const recentTransactionsLoading =
    recentTx.status === 'loading' && recentTx.items.length === 0 && !hasPageCache

  const explorerBase =
    recentTx.explorerBaseUrl?.trim().replace(/\/+$/, '') || getDefaultBlockExplorerBase()
  const contract = recentTx.poolContractAddress?.trim() ?? null
  const recentTransactionsExplorerHref =
    explorerBase && contract && isExplorerLinkableAddress(explorerBase, contract)
      ? blockExplorerAddressUrl(explorerBase, contract)
      : null

  if (!config) {
    return <Navigate to={dashboardHomePath('merchant', isKycVerified)} replace />
  }

  const topBarBreadcrumbs: DashboardBreadcrumbItem[] = [
    { label: 'Explore Lending Pools', to: dashboardHomePath('merchant', isKycVerified) },
    { label: 'Lending Pool' },
  ]

  return (
    <DashboardLayout
      dashboardBasePath="/dashboard/merchant"
      topBarBreadcrumbs={topBarBreadcrumbs}
      topBarWalletDisplay="0x7A3F...92C1"
    >
      <LendingPoolDetailPageContent
        config={config}
        onApplyToBorrow={() => navigate(`/dashboard/merchant/lending-pool/${poolSlug}/apply-loan`)}
        recentTransactions={recentTx.items}
        recentTransactionsPaginationMeta={paginationMeta}
        onRecentTransactionsPageChange={setPage}
        recentTransactionsLoading={recentTransactionsLoading}
        recentTransactionsExplorerHref={recentTransactionsExplorerHref}
      />
    </DashboardLayout>
  )
}

export default MerchantLoanDetailPage
