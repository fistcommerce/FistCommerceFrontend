import type { RiskTier } from '@/api/riskTiers'

function activeTiers(tiers: RiskTier[]): RiskTier[] {
  return tiers.filter((t) => t.active)
}

function formatRate(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 0 })
}

/** e.g. `5%`, `5-10%` from active risk tiers (flat tenor interest). */
export function formatActiveRiskTierInterestBand(tiers: RiskTier[]): string | null {
  const active = activeTiers(tiers)
  if (active.length === 0) return null
  const rates = active.map((t) => t.interest_percent)
  const min = Math.min(...rates)
  const max = Math.max(...rates)
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  return min === max ? `${formatRate(min)}%` : `${formatRate(min)}-${formatRate(max)}%`
}

/** e.g. `30 Days`, `30-90 Days` from active risk tiers. */
export function formatActiveRiskTierDurationBand(tiers: RiskTier[]): string | null {
  const active = activeTiers(tiers)
  if (active.length === 0) return null
  const days = active.map((t) => t.duration_days)
  const min = Math.min(...days)
  const max = Math.max(...days)
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) return null
  return min === max ? `${min} Days` : `${min}-${max} Days`
}
