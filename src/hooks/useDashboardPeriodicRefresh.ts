import { useEffect, useRef } from 'react'

/** Matches admin payout/governance poll cadence; Celery metrics refresh ~2m. */
export const DASHBOARD_POLL_MS = 60_000

type UseDashboardPeriodicRefreshOptions = {
  enabled: boolean
  /** Called for interval + tab-focus refreshes (should use background: true). */
  onRefresh: () => void
  /** Skip a tick while a foreground sync is in flight. */
  isBusy?: () => boolean
  intervalMs?: number
}

/**
 * Periodically re-fetch dashboard data while the tab is visible, and once when
 * the tab becomes visible again. Does not run the initial kickoff load.
 */
export function useDashboardPeriodicRefresh({
  enabled,
  onRefresh,
  isBusy,
  intervalMs = DASHBOARD_POLL_MS,
}: UseDashboardPeriodicRefreshOptions): void {
  const onRefreshRef = useRef(onRefresh)
  const isBusyRef = useRef(isBusy)
  onRefreshRef.current = onRefresh
  isBusyRef.current = isBusy

  useEffect(() => {
    if (!enabled) return

    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      if (isBusyRef.current?.()) return
      onRefreshRef.current()
    }

    const id = window.setInterval(tick, intervalMs)

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      tick()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled, intervalMs])
}
