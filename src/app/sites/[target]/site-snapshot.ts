import { getClaim, getDrChecks } from "@/server/db.mjs"

type ChartPoint = {
  checkedAt: string
  domainRating: number
}

type SiteSnapshot = {
  chartPoints: ChartPoint[]
  domainRating: number | null
}

function clampDomainRating(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.min(100, Math.floor(parsed)))
}

export async function loadSiteSnapshot(domain: string): Promise<SiteSnapshot> {
  const [checks, claim] = await Promise.all([
    getDrChecks(domain, { limit: 60 }),
    getClaim(domain),
  ])

  let domainRating = claim ? clampDomainRating(claim.domain_rating) : null
  let lastCheckedAt = claim?.updated_at ? new Date(claim.updated_at) : null

  if (checks.length > 0) {
    const last = checks[checks.length - 1]
    const lastValue = clampDomainRating(last?.domain_rating)
    if (domainRating === null && lastValue !== null) {
      domainRating = lastValue
    }
    if (!lastCheckedAt && last?.checked_at) {
      lastCheckedAt = new Date(last.checked_at)
    }
  }

  const chartPoints =
    checks.length > 0
      ? checks
          .map((row: { checked_at?: string; domain_rating?: number }) => {
            const rating = clampDomainRating(row.domain_rating)
            if (rating === null) return null
            return {
              checkedAt: String(row.checked_at),
              domainRating: rating,
            }
          })
          .filter((row: ChartPoint | null): row is ChartPoint => row !== null)
      : domainRating !== null
        ? [
            {
              checkedAt: (lastCheckedAt || new Date()).toISOString(),
              domainRating,
            },
          ]
        : []

  return { chartPoints, domainRating }
}
