import type { MerchantRepayLocationState } from '@/hooks/useMerchantRepayLoanContext'

export type StoredRepayUsdcSource = NonNullable<MerchantRepayLocationState['usdcSource']>

function storageKey(loanId: string): string {
  return `fist:repay-usdc-source:${loanId.trim()}`
}

function getSessionStorage(): Storage | null {
  try {
    const ss = globalThis.sessionStorage
    if (!ss) return null
    return ss
  } catch {
    return null
  }
}

export function saveRepayUsdcSource(loanId: string, source: StoredRepayUsdcSource): void {
  const id = loanId.trim()
  const ss = getSessionStorage()
  if (!id || !ss) return
  try {
    ss.setItem(storageKey(id), JSON.stringify(source))
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadRepayUsdcSource(loanId: string): StoredRepayUsdcSource | null {
  const id = loanId.trim()
  const ss = getSessionStorage()
  if (!id || !ss) return null
  try {
    const raw = ss.getItem(storageKey(id))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredRepayUsdcSource
    if (
      !parsed ||
      typeof parsed.chainId !== 'number' ||
      typeof parsed.label !== 'string' ||
      typeof parsed.requiresBridge !== 'boolean'
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function clearRepayUsdcSource(loanId: string): void {
  const id = loanId.trim()
  const ss = getSessionStorage()
  if (!id || !ss) return
  try {
    ss.removeItem(storageKey(id))
  } catch {
    /* ignore */
  }
}

export function resolveRepayUsdcSource(
  loanId: string,
  fromState: MerchantRepayLocationState['usdcSource'] | undefined,
): StoredRepayUsdcSource | null {
  if (fromState) return fromState
  return loadRepayUsdcSource(loanId)
}
