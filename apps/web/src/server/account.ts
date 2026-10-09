// Loads the account pages' data for the signed-in email (#142): the plan, every claimed site
// with its latest DR, month change and last year of readings, and the weekly average DR.
import 'server-only'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'

import { listClaimsByEmail, listDrChecksForDomains } from '@/db'
import {
  type Account,
  type AccountPlan,
  type AccountSite,
  averageChange,
  type DrPoint,
  monthChange,
  weeklyAverage
} from '@/lib/account'
import { loginHref } from '@/lib/auth/callback-url'
import { PRICING_TIERS } from '@/lib/pricing'
import { getSessionEmail } from '@/server/auth/session'
import { resolveEntitlement } from '@/server/entitlements.mjs'

/**
 * A plan holds at most 100 sites; an internal account can hold more, so the list is capped and
 * the pages say how many it leaves out.
 */
const MAX_SITES = 500
const YEAR_MS = 366 * 24 * 60 * 60 * 1000

type Entitlement = Awaited<ReturnType<typeof resolveEntitlement>>

export function planOf(entitlement: Entitlement): AccountPlan {
  const paid = Boolean(entitlement?.canAccessPaidFeatures)
  if (entitlement?.isUnlimited) {
    return { kind: 'active', paid, domains: null, interval: null, price: null, periodEnd: null }
  }
  const subscription = entitlement?.subscription
  const status = subscription?.status ?? null
  // Stripe moves the period end forward before a renewal charge fails, so a past_due plan is
  // usually still in its paid period (the entitlement's grace): it works, but it is past due.
  const pastDue = Boolean(subscription) && (status === 'past_due' || status === 'unpaid')
  if (!entitlement || (!paid && !pastDue)) {
    return {
      kind: 'free',
      paid: false,
      domains: null,
      interval: null,
      price: null,
      periodEnd: null
    }
  }
  const interval =
    subscription?.billingInterval === 'annual' || subscription?.billingInterval === 'monthly'
      ? subscription.billingInterval
      : null
  const tier = PRICING_TIERS.find(candidate => candidate.domains === entitlement.domainsLimit)
  const periodEnd = subscription?.currentPeriodEnd
  return {
    kind: pastDue
      ? 'past-due'
      : status === 'canceled' || subscription?.cancelAtPeriodEnd
        ? 'ending'
        : 'active',
    paid,
    domains: entitlement.domainsLimit,
    interval,
    price: tier && interval ? tier[interval] : null,
    periodEnd: periodEnd instanceof Date ? periodEnd.toISOString() : null
  }
}

/** Every claim, a page of 100 at a time (the query's page limit), up to MAX_SITES. */
async function allClaims(email: string) {
  const claims: Awaited<ReturnType<typeof listClaimsByEmail>> = []
  while (claims.length < MAX_SITES) {
    const page = await listClaimsByEmail({ email, limit: 100, offset: claims.length, sort: 'dr' })
    claims.push(...page)
    if (page.length < 100) break
  }
  return claims
}

export async function loadAccount(email: string, now = new Date()): Promise<Account> {
  const [entitlement, claims] = await Promise.all([
    resolveEntitlement({ email, now }),
    allClaims(email)
  ])
  const checks = await listDrChecksForDomains(
    claims.map(claim => claim.domain),
    new Date(now.getTime() - YEAR_MS)
  )
  const historyOf = new Map<string, DrPoint[]>()
  for (const check of checks) {
    const history = historyOf.get(check.domain) ?? []
    history.push({ checkedAt: check.checked_at, domainRating: check.domain_rating })
    historyOf.set(check.domain, history)
  }
  const sites: AccountSite[] = claims.map(claim => {
    const history = historyOf.get(claim.domain) ?? []
    const latest = history.at(-1)
    return {
      domain: claim.domain,
      title: claim.site_title,
      dr: latest?.domainRating ?? claim.domain_rating,
      change: monthChange(history, now),
      checkedAt: latest?.checkedAt ?? null,
      history
    }
  })
  sites.sort((a, b) => (b.dr ?? -1) - (a.dr ?? -1) || a.domain.localeCompare(b.domain))
  return {
    email,
    plan: planOf(entitlement),
    canClaim: Boolean(entitlement?.canClaim),
    sites,
    average: weeklyAverage(
      sites.map(site => site.history),
      now
    ),
    trend: averageChange(sites.map(site => site.history)),
    omitted: Math.max(0, (entitlement?.domainsUsed ?? 0) - sites.length)
  }
}

/** The account for this request's session, or null when signed out; loaded once per request. */
export const currentAccount = cache(async function currentAccount(): Promise<Account | null> {
  const email = await getSessionEmail({ headers: await headers() })
  return email ? loadAccount(email) : null
})

/** The signed-in account, or a redirect to /login that comes back to `path`. */
export async function requireAccount(path: string): Promise<Account> {
  const account = await currentAccount()
  if (!account) redirect(loginHref(path))
  return account
}
