/**
 * Display helpers for investor on-chain balance boxes.
 * Keeps "—" vs numeric formatting rules testable without mounting hooks.
 */
export function formatInvestorWalletBalanceDisplay(params: {
  readAddress: string | null | undefined
  isLoading: boolean
  formattedBalance: string | null | undefined
  formatMetric: (value: string) => string
}): string {
  if (!params.readAddress?.trim()) return '—'
  if (params.isLoading) return '—'
  const formatted = params.formattedBalance
  if (formatted == null || formatted === '' || formatted === '—') return '—'
  return params.formatMetric(formatted)
}

export function formatInvestorInvestmentBalanceDisplay(params: {
  readAddress: string | null | undefined
  isLoading: boolean
  positionDisplay: string | null | undefined
}): string {
  if (!params.readAddress?.trim()) return '—'
  if (params.isLoading) return '—'
  const display = params.positionDisplay
  if (display == null || display === '') return '—'
  return display
}
