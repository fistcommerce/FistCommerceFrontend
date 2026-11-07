import type { LendingPoolDetailConfig, MerchantLoanTableRowData } from '@/components/dashboard/merchant/lending-pool-detail/types'

const OVERVIEW_PARAGRAPHS = [
  'This lending pool allocates capital to qualified merchants against verified purchase orders and short-term working capital needs. Each facility is sized to the underlying trade flow, with documentation reviewed before drawdown and disbursement tracked on-chain where applicable.',
  'Risk is managed through diversification across merchants and sectors, concentration limits per borrower, and ongoing monitoring of repayment behavior. Collateral or guarantees may be required depending on program tier and history with the platform.',
  'Liquidity for investors is supported by scheduled repayments and defined maturities. Pool parameters—including target duration, yield bands, and utilization targets—are published here and may be updated as market conditions change.',
  'Before participating, review the terms for loan section and your own risk tolerance. Past performance does not guarantee future results; principal is at risk. For questions, contact support or review the pool prospectus in the documents area.',
]

const FINANCIAL_INFO_ROWS: { label: string; value: string }[] = [
  { label: 'Available Liquidity', value: '$120,000' },
  { label: 'Total Pool Size', value: '$340,000' },
  { label: 'Average APY to Investors', value: '6.2% APY' },
  { label: 'Utilization Rate', value: '62%' },
  { label: 'Merchant Repayment Amount', value: 'Allowed' },
  { label: 'Yield Distributed', value: 'N/A' },
]

const TERMS_FOR_LOAN_ROWS: { label: string; value: string }[] = [
  { label: 'Borrow APR', value: '—' },
  { label: 'Repayment Structure', value: 'In full at Maturity' },
  { label: 'Loan Duration', value: '—' },
  { label: 'Grace Period', value: 'N/A' },
  { label: 'Early Repayment', value: 'Allowed' },
]

const DEMO_LOAN_TEMPLATE: Omit<MerchantLoanTableRowData, 'id'> = {
  merchantName: 'Ajala Harris',
  walletShort: '48r7tyfghn4j3kia9eud...',
  loanAmount: '$23,000',
  issueDate: '03-03-2026',
  repaymentDue: '27-05-2026',
  repaymentAmount: '$40,000',
  repaymentApy: '4.3% APY',
  debtStatus: 'Unpaid',
}

const fourDemoLoans: MerchantLoanTableRowData[] = [1, 2, 3, 4].map((n) => ({
  id: String(n),
  ...DEMO_LOAN_TEMPLATE,
}))

const BASE_POOL: Omit<LendingPoolDetailConfig, 'title' | 'subtitle' | 'loans'> = {
  overviewParagraphs: OVERVIEW_PARAGRAPHS,
  financialInfoRows: FINANCIAL_INFO_ROWS,
  termsForLoanRows: TERMS_FOR_LOAN_ROWS,
  stats: [
    { label: 'Total Deposited', value: '—' },
    { label: 'Liquid Asset', value: '—' },
    { label: 'Maximum loan', value: '—', hint: 'Available liquidity' },
    { label: 'Loan Interest', value: '—', hint: 'To be repaid' },
    { label: 'Target Repayment Duration', value: '—' },
  ],
}

/** Mock configs keyed by URL slug — replace with API data later. */
const POOL_DETAILS: Record<string, LendingPoolDetailConfig> = {
  'fist-commerce-lending-pool': {
    ...BASE_POOL,
    title: 'Fist Commerce Lending Pool',
    subtitle: 'Moderate risk, moderate returns.',
    loans: fourDemoLoans,
  },
  'titan-growth-fund': {
    ...BASE_POOL,
    title: 'Titan Growth Fund',
    subtitle: 'Moderate risk, Moderate returns.',
    loans: fourDemoLoans,
  },
}

export function getLendingPoolDetailConfig(slug: string | undefined): LendingPoolDetailConfig | null {
  if (!slug) return null
  return POOL_DETAILS[slug] ?? null
}
