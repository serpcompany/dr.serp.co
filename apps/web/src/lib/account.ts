// What the account pages show (#142), and the arithmetic behind it. Client-safe: the pages build
// this on the server (src/server/account.ts) and pass it to the client table and chart.

export type DrPoint = { checkedAt: string; domainRating: number }

export type AccountSite = {
  domain: string
  title: string | null
  /** The latest DR, or null before the first lookup. */
  dr: number | null
  /** DR now minus DR a month ago, or null without readings from both this month and before. */
  change: number | null
  /** No reading in the last 30 days, so there is no change "this month" to show. */
  stale: boolean
  /** The latest check in the last year, as an ISO date, or null. */
  checkedAt: string | null
  /** Readings for the last year, oldest first, for the site panel's chart. */
  history: DrPoint[]
}

export type AccountPlan = {
  /**
   * No plan, an active one, one whose last payment failed (Stripe's past_due or unpaid, in or
   * after its paid period), or one that ends at the period end (canceled, or set to cancel).
   */
  kind: 'free' | 'active' | 'past-due' | 'ending'
  /**
   * Whether the plan's paid features apply now: its sites link dofollow and recheck weekly. The
   * same rule as the public site page (the entitlement's canAccessPaidFeatures).
   */
  paid: boolean
  /** A dr.serp.co subscription Stripe still bills, which a plan change can move (not canceled). */
  live: boolean
  /** Whether Stripe has a customer for the account, so its billing portal opens. */
  portal: boolean
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
  /** Each site's change over its readings this year, averaged (`averageChange`), or null. */
  trend: number | null
  /** How many claimed sites the pages leave out (an internal account past the list's cap). */
  omitted: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The change this month: the latest reading, if it is from the last 30 days, minus the last
 * reading from 30 to 60 days ago. Null without both, so a site last checked in March has none,
 * and neither has one whose earlier reading is from last year.
 */
export function monthChange(history: readonly DrPoint[], now: Date): number | null {
  const cutoff = now.getTime() - 30 * DAY_MS
  const floor = now.getTime() - 60 * DAY_MS
  const latest = history.at(-1)
  if (!latest || Date.parse(latest.checkedAt) <= cutoff) return null
  const before = [...history].reverse().find(point => Date.parse(point.checkedAt) <= cutoff)
  return before && Date.parse(before.checkedAt) >= floor
    ? latest.domainRating - before.domainRating
    : null
}

/** Whether the history has no reading in the last 30 days. */
export function isStale(history: readonly DrPoint[], now: Date): boolean {
  const latest = history.at(-1)
  return !latest || Date.parse(latest.checkedAt) <= now.getTime() - 30 * DAY_MS
}

/**
 * Each site's change from its first reading in the history to its latest, averaged over the sites
 * whose readings span at least 30 days, and rounded. Adding or releasing a site doesn't move it,
 * unlike the difference between two points of the average chart. Null when no site qualifies.
 */
export function averageChange(histories: readonly (readonly DrPoint[])[]): number | null {
  const changes = histories.flatMap(history => {
    const first = history.at(0)
    const latest = history.at(-1)
    if (!first || !latest) return []
    const span = Date.parse(latest.checkedAt) - Date.parse(first.checkedAt)
    return span >= 30 * DAY_MS ? [latest.domainRating - first.domainRating] : []
  })
  if (changes.length === 0) return null
  return Math.round(changes.reduce((sum, change) => sum + change, 0) / changes.length)
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

/** "25-site plan", "Unlimited plan" or "Free plan", as the sidebar's user menu names it. */
export function planLabel(plan: AccountPlan): string {
  if (plan.kind === 'free') return 'Free plan'
  return plan.domains === null ? 'Unlimited plan' : `${plan.domains}-site plan`
}
