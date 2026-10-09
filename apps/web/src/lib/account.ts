// What the account pages show (#142), and the arithmetic behind it. Client-safe: the pages build
// this on the server (src/server/account.ts) and pass it to the client table and chart.

export type DrPoint = { checkedAt: string; domainRating: number }

export type AccountSite = {
  domain: string
  title: string | null
  /** The latest DR, or null before the first lookup. */
  dr: number | null
  /** DR now minus DR a month ago, or null without a reading from a month ago. */
  change: number | null
  /** The latest check, as an ISO date, or null. */
  checkedAt: string | null
  /** Readings for the last year, oldest first, for the site panel's chart. */
  history: DrPoint[]
}

export type AccountPlan = {
  /** No plan, an active one, one whose payment failed, or one that ends at the period end. */
  kind: 'free' | 'active' | 'past-due' | 'ending'
  /** The site limit, or null for an unlimited (internal) account. */
  domains: number | null
  interval: 'monthly' | 'annual' | null
  /** The price for the interval in whole dollars, when it matches a tier. */
  price: number | null
  /** The renewal (or end) date, as an ISO date, or null. */
  periodEnd: string | null
}

export type Account = {
  email: string
  plan: AccountPlan
  /** Whether the plan has a free slot to claim another site. */
  canClaim: boolean
  /** Claimed sites, highest DR first. */
  sites: AccountSite[]
  /** The average DR of the claimed sites at the end of each week, oldest first. */
  average: { date: string; average: number }[]
}

const DAY_MS = 24 * 60 * 60 * 1000

/** DR now minus the last reading at least 30 days older than the latest; null without one. */
export function monthChange(history: readonly DrPoint[]): number | null {
  const latest = history.at(-1)
  if (!latest) return null
  const cutoff = Date.parse(latest.checkedAt) - 30 * DAY_MS
  const before = [...history].reverse().find(point => Date.parse(point.checkedAt) <= cutoff)
  return before ? latest.domainRating - before.domainRating : null
}

/**
 * The average DR across sites at the end of each of the last `weeks` weeks before `now`: each
 * site counts with its latest reading up to that week's end, and sites with no reading yet don't
 * count. Weeks before any site has a reading are left out.
 */
export function weeklyAverage(
  histories: readonly (readonly DrPoint[])[],
  now: Date,
  weeks = 52
): { date: string; average: number }[] {
  const points: { date: string; average: number }[] = []
  for (let week = weeks - 1; week >= 0; week--) {
    const end = now.getTime() - week * 7 * DAY_MS
    const values = histories.flatMap(history => {
      const reading = [...history].reverse().find(point => Date.parse(point.checkedAt) <= end)
      return reading ? [reading.domainRating] : []
    })
    if (values.length === 0) continue
    const average = values.reduce((sum, value) => sum + value, 0) / values.length
    points.push({
      date: new Date(end).toISOString().slice(0, 10),
      average: Math.round(average * 10) / 10
    })
  }
  return points
}

/** "25 sites", or "Unlimited" for an internal account. */
export function planName(plan: AccountPlan): string {
  if (plan.kind === 'free') return 'Free'
  return plan.domains === null ? 'Unlimited' : `${plan.domains} sites`
}
