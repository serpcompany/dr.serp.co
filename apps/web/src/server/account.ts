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
  type DrPoint,
  monthChange,
  weeklyAverage
} from '@/lib/account'
import { loginHref } from '@/lib/auth/callback-url'
import { PRICING_TIERS } from '@/lib/pricing'
import { getSessionEmail } from '@/server/auth/session'
import { resolveEntitlement } from '@/server/entitlements.mjs'

/** A plan holds at most 100 sites; an internal account can hold more, so the list is capped. */
const MAX_SITES = 500
const YEAR_MS = 366 * 24 * 60 * 60 * 1000

type Entitlement = Awaited<ReturnType<typeof resolveEntitlement>>

export function planOf(entitlement: Entitlement): AccountPlan {
  if (!entitlement?.canAccessPaidFeatures) {
    const subscription = entitlement?.subscription
    return {
      kind: subscription && entitlement?.status === 'past_due' ? 'past-due' : 'free',
      domains: subscription?.domainsLimit ?? null,
      interval: null,
      price: null,
      periodEnd: null
    }
  }
  if (entitlement.isUnlimited) {
    return { kind: 'active', domains: null, interval: null, price: null, periodEnd: null }
  }
  const subscription = entitlement.subscription
  const interval =
    subscription?.billingInterval === 'annual' || subscription?.billingInterval === 'monthly'
      ? subscription.billingInterval
      : null
  const tier = PRICING_TIERS.find(candidate => candidate.domains === entitlement.domainsLimit)
  const periodEnd = subscription?.currentPeriodEnd
  return {
    kind: subscription?.cancelAtPeriodEnd ? 'ending' : 'active',
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
      change: monthChange(history),
      checkedAt: latest?.checkedAt ?? claim.updated_at ?? null,
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
    )
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
