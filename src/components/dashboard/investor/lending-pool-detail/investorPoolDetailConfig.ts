import type { InvestorPoolDetailConfig } from '@/components/dashboard/investor/lending-pool-detail/types'

const FIST_COMMERCE: InvestorPoolDetailConfig = {
  title: 'Fist Commerce Lending Pool',
  subtitle: 'Moderate risk, Moderate returns.',
  topBar: {
    walletDisplay: '0x7A3F...92C1',
    showUnreadNotification: true,
  },
  headerStats: [
    { label: 'Total Deposited', value: '—' },
    { label: 'Liquid Asset', value: '—' },
    { label: 'Maximum loan', value: '—' },
    { label: 'Loan Interest', value: '—' },
    { label: 'Target Repayment Duration', value: '—' },
  ],
  myStats: [
    { label: 'Invested', value: '$20K' },
    { label: 'Pool Share', value: '2.5%' },
    { label: 'Earnings', value: '$4K' },
    { label: 'Pending Returns', value: '$3K' },
  ],
  poolPerformanceStats: [
    { label: 'Total Value Locked (TVL)', value: '$800K' },
    { label: 'Average APY', value: '6-8%' },
    { label: 'Total Loans Funded', value: '142' },
    { label: 'Repayment Success Rate', value: '99.3%' },
    { label: 'Historical Default Rate', value: '2.4%' },
  ],
  strategyIntro:
    'The Titan Growth Fund targets short-duration merchant financing with a moderate risk profile. Capital is allocated to verified SMEs against purchase orders and receivables, with diversification across sectors and strict concentration limits. The strategy emphasizes predictable cash flows and documented trade history before onboarding new merchants.',
  strategyFeatures: [
    {
      icon: 'clock',
      title: 'Target Loan Duration',
      description: '30–90 days short-term financing',
    },
    {
      icon: 'briefcase',
      title: 'Financing Type',
      description: 'Purchase order & receivables financing',
    },
    {
      icon: 'target',
      title: 'Merchant Types',
      description: 'Verified SME merchants with trade history',
    },
    {
      icon: 'shield',
      title: 'Risk Tier',
      description: 'Moderate – balanced risk/reward profile',
    },
  ],
  contractRows: [
    {
      label: 'Smart Contract Address',
      value: '0x7a3B...9F2e',
      copyValue: '0x7a3B1c4d9e2f8a0b5c6d7e8f9F2e1234567890abcd',
    },
    { label: 'Blockchain Network', value: 'Arbitrum One' },
    { label: 'Audit Status', value: 'Audited by OpenZeppelin', badge: 'Certified' },
    { label: 'Protocol Version', value: 'Version 2.0' },
  ],
  transactions: [
    {
      id: '1',
      walletShort: '0x7A3F…92C1',
      type: 'Deposit',
      amount: '+$5,000',
      amountTone: 'positive',
      timeAgo: '12 min ago',
    },
    {
      id: '2',
      walletShort: '0x9b3e…1e6b',
      type: 'Loan Funded',
      amount: '-$45,000',
      amountTone: 'negative',
      timeAgo: '2 hrs ago',
    },
    {
      id: '3',
      walletShort: '0x48r7…eud',
      type: 'Repayment',
      amount: '+$53,950',
      amountTone: 'positive',
      timeAgo: '5 hrs ago',
    },
    {
      id: '4',
      walletShort: '0x1a2b…3c4d',
      type: 'Interest Payout',
      amount: '-$3,400',
      amountTone: 'negative',
      timeAgo: '3 days ago',
    },
  ],
}

const POOLS: Record<string, InvestorPoolDetailConfig> = {
  'fist-commerce-lending-pool': FIST_COMMERCE,
  'titan-growth-fund': { ...FIST_COMMERCE, title: 'Titan Growth Fund' },
}

export type GetInvestorPoolDetailConfigOptions = {
  /** When set, the current dashboard pool id may use the default template if not in `POOLS`. */
  dashboardPoolId?: string
}

/**
 * Static copy, strategy, contracts, and demo transactions for pool detail routes.
 * Hero / my-stats values are replaced at runtime when metrics load (see `mergeInvestorPoolDetailWithMetrics`).
 */
export function getInvestorPoolDetailConfig(
  slug: string | undefined,
  options?: GetInvestorPoolDetailConfigOptions,
): InvestorPoolDetailConfig | null {
  if (!slug) return null
  if (POOLS[slug]) return POOLS[slug]
  if (options?.dashboardPoolId && slug === options.dashboardPoolId) {
    return { ...FIST_COMMERCE }
  }
  return null
}

export function investorPoolSlugMatchesDashboard(
  poolSlug: string | undefined,
  dashboardPoolId: string,
): boolean {
  return Boolean(poolSlug && (POOLS[poolSlug] !== undefined || poolSlug === dashboardPoolId))
}
