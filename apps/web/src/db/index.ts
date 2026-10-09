// The data layer for the site: each query bound to this request's D1 binding, so callers write
// `await listSites({ ... })`. Tests and scripts that hold a database call the modules directly
// with a client from dbFrom().
import 'server-only'

import { getCloudflareContext } from '@opennextjs/cloudflare'

import * as billingAudit from './billing-audit'
import * as checks from './checks'
import * as claims from './claims'
import { type Db, dbFrom } from './client'
import * as sites from './sites'
import * as subscriptions from './subscriptions'

export type { Db } from './client'
export { normalizeSearchQuery } from './listable'

// Reads env.DB per request, never at module scope (environment-configuration.md). Under
// `next dev`, initOpenNextCloudflareForDev() in next.config.ts provides local D1.
export async function getDb(): Promise<Db> {
  const { env } = await getCloudflareContext({ async: true })
  return dbFrom(env.DB)
}

function bound<A extends unknown[], R>(query: (db: Db, ...args: A) => Promise<R>) {
  return async (...args: A): Promise<R> => query(await getDb(), ...args)
}

export const getClaim = bound(claims.getClaim)
export const upsertClaim = bound(claims.upsertClaim)
export const setClaimEmail = bound(claims.setClaimEmail)
export const clearClaimEmail = bound(claims.clearClaimEmail)
export const touchDomain = bound(claims.touchDomain)
export const setClaimSiteMetadata = bound(claims.setClaimSiteMetadata)
export const listClaims = bound(claims.listClaims)
export const countClaims = bound(claims.countClaims)
export const listClaimRows = bound(claims.listClaimRows)
export const listClaimsByEmail = bound(claims.listClaimsByEmail)
export const countClaimsByEmail = bound(claims.countClaimsByEmail)

export const recordDrCheck = bound(checks.recordDrCheck)
export const recordDrHistoryChecks = bound(checks.recordDrHistoryChecks)
export const getDrChecks = bound(checks.getDrChecks)
export const listDrChecks = bound(checks.listDrChecks)

export const listSites = bound(sites.listSites)
export const countSites = bound(sites.countSites)
export const listSitemapSites = bound(sites.listSitemapSites)
export const purgeInvalidSiteDomains = bound(sites.purgeInvalidSiteDomains)

export const upsertSubscription = bound(subscriptions.upsertSubscription)
export const getActiveSubscriptionByEmail = bound(subscriptions.getActiveSubscriptionByEmail)
export const getLatestSubscriptionByEmail = bound(subscriptions.getLatestSubscriptionByEmail)
export const listSubscriptions = bound(subscriptions.listSubscriptions)

export const insertBillingAudit = bound(billingAudit.insertBillingAudit)
export const getLatestBillingAuditEvent = bound(billingAudit.getLatestBillingAuditEvent)
export const listBillingAudit = bound(billingAudit.listBillingAudit)
export const countPrunableBillingAudit = bound(billingAudit.countPrunableBillingAudit)
export const pruneBillingAudit = bound(billingAudit.pruneBillingAudit)

export async function getLatestBillingAuditFailure() {
  return getLatestBillingAuditEvent({ success: false })
}
