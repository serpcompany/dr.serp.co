// Claims: one row per domain with its owner's email, latest DR and site metadata. Looking up or
// rendering a site also writes a row here, so a row with no email is an unclaimed site.
import { and, asc, count, desc, eq, type SQL, sql } from 'drizzle-orm'

import type { Db } from './client'
import { normalizeSearchQuery } from './listable'
import { drClaims } from './schema'
import { excluded, excludedOrStored } from './upsert'
import {
  clampDr,
  clampOffset,
  isFiniteNumber,
  MAX_LIST_OFFSET,
  normalizeEmail,
  nowIsoText
} from './values'

export type ClaimRow = {
  domain: string
  email: string | null
  domain_rating: number | null
  provider: string | null
  site_title: string | null
  meta_description: string | null
  site_url: string | null
  screenshot_url: string | null
  claimed_at: string
  updated_at: string
}

const CLAIM_ROW = {
  domain: drClaims.domain,
  email: drClaims.email,
  domain_rating: drClaims.domainRating,
  provider: drClaims.provider,
  site_title: drClaims.siteTitle,
  meta_description: drClaims.metaDescription,
  site_url: drClaims.siteUrl,
  screenshot_url: drClaims.screenshotUrl,
  claimed_at: drClaims.claimedAt,
  updated_at: drClaims.updatedAt
}

export type ClaimListRow = Pick<
  ClaimRow,
  | 'domain'
  | 'domain_rating'
  | 'updated_at'
  | 'site_title'
  | 'meta_description'
  | 'site_url'
  | 'screenshot_url'
>

const CLAIM_LIST_ROW = {
  domain: drClaims.domain,
  domain_rating: drClaims.domainRating,
  updated_at: drClaims.updatedAt,
  site_title: drClaims.siteTitle,
  meta_description: drClaims.metaDescription,
  site_url: drClaims.siteUrl,
  screenshot_url: drClaims.screenshotUrl
}

export async function getClaim(db: Db, domain: string): Promise<ClaimRow | null> {
  const [row] = await db
    .select(CLAIM_ROW)
    .from(drClaims)
    .where(eq(drClaims.domain, domain))
    .limit(1)
  return row ?? null
}

// Records a DR reading for a domain. A NULL email keeps the stored owner.
export async function upsertClaim(
  db: Db,
  input: { domain: string; email?: string | null; domainRating: unknown; provider?: string | null }
): Promise<ClaimRow | null> {
  const [row] = await db
    .insert(drClaims)
    .values({
      domain: input.domain,
      email: input.email ?? null,
      domainRating: clampDr(input.domainRating),
      provider: input.provider ?? null,
      updatedAt: nowIsoText()
    })
    .onConflictDoUpdate({
      target: drClaims.domain,
      set: {
        email: excludedOrStored(drClaims.email),
        domainRating: excluded(drClaims.domainRating),
        provider: excluded(drClaims.provider),
        updatedAt: excluded(drClaims.updatedAt)
      }
    })
    .returning(CLAIM_ROW)
  return row ?? null
}

// Sets a domain's owner without touching its DR. Never takes over a domain another email owns
// (compared case-insensitively): the update is skipped and the answer is null.
export async function setClaimEmail(
  db: Db,
  input: { domain: string; email: string }
): Promise<ClaimRow | null> {
  const [row] = await db
    .insert(drClaims)
    .values({ domain: input.domain, email: input.email, updatedAt: nowIsoText() })
    .onConflictDoUpdate({
      target: drClaims.domain,
      set: { email: excluded(drClaims.email), updatedAt: excluded(drClaims.updatedAt) },
      setWhere: sql`${drClaims.email} IS NULL OR lower(${drClaims.email}) = lower(${excluded(drClaims.email)})`
    })
    .returning(CLAIM_ROW)
  return row ?? null
}

// Releases a claim when the email matches, keeping the domain and its DR so the site stays listed.
export async function clearClaimEmail(
  db: Db,
  input: { domain: unknown; email: unknown }
): Promise<ClaimRow | null> {
  const domain = String(input.domain ?? '').trim()
  const email = normalizeEmail(input.email)
  if (!domain || !email) return null
  const [row] = await db
    .update(drClaims)
    .set({ email: null, updatedAt: nowIsoText() })
    .where(and(eq(drClaims.domain, domain), sql`lower(${drClaims.email}) = ${email}`))
    .returning(CLAIM_ROW)
  return row ?? null
}

// Stores a domain even before its DR is known, so a visited site appears in the directory.
export async function touchDomain(db: Db, domain: unknown): Promise<ClaimRow | null> {
  const normalized = String(domain ?? '').trim()
  if (!normalized) return null
  const [row] = await db
    .insert(drClaims)
    .values({ domain: normalized, updatedAt: nowIsoText() })
    .onConflictDoUpdate({
      target: drClaims.domain,
      set: { updatedAt: excluded(drClaims.updatedAt) }
    })
    .returning(CLAIM_ROW)
  return row ?? null
}

// Stores a site's title, description, URL and screenshot. A NULL field keeps the stored value.
export async function setClaimSiteMetadata(
  db: Db,
  input: {
    domain: unknown
    siteTitle?: string | null
    metaDescription?: string | null
    siteUrl?: string | null
    screenshotUrl?: string | null
  }
): Promise<ClaimRow | null> {
  const domain = String(input.domain ?? '').trim()
  if (!domain) return null
  const [row] = await db
    .insert(drClaims)
    .values({
      domain,
      siteTitle: input.siteTitle ?? null,
      metaDescription: input.metaDescription ?? null,
      siteUrl: input.siteUrl ?? null,
      screenshotUrl: input.screenshotUrl ?? null,
      updatedAt: nowIsoText()
    })
    .onConflictDoUpdate({
      target: drClaims.domain,
      set: {
        siteTitle: excludedOrStored(drClaims.siteTitle),
        metaDescription: excludedOrStored(drClaims.metaDescription),
        siteUrl: excludedOrStored(drClaims.siteUrl),
        screenshotUrl: excludedOrStored(drClaims.screenshotUrl),
        updatedAt: excluded(drClaims.updatedAt)
      }
    })
    .returning(CLAIM_ROW)
  return row ?? null
}

type ListOpts = { query?: unknown; limit?: number; offset?: number; sort?: 'dr' | 'updated' }

// q is a normalized search (see listable.ts), matched with instr() because D1 refuses long LIKE
// patterns.
function matchesSearch(q: string | null): SQL | undefined {
  return q === null ? undefined : sql`instr(lower(${drClaims.domain}), ${q}) > 0`
}

// A page of claims, all of them or one email's, by DR or by the latest change. NULLs sort last.
async function listClaimPage(db: Db, email: string | null, opts: ListOpts) {
  const limit = isFiniteNumber(opts.limit) ? Math.max(1, Math.min(100, opts.limit)) : 25
  const offset = clampOffset(opts.offset)
  if (offset > MAX_LIST_OFFSET) return []
  const q = normalizeSearchQuery(opts.query)
  const byUpdated = [
    sql`${drClaims.updatedAt} IS NULL`,
    desc(drClaims.updatedAt),
    asc(drClaims.domain)
  ]
  const order =
    opts.sort === 'updated'
      ? byUpdated
      : [sql`${drClaims.domainRating} IS NULL`, desc(drClaims.domainRating), ...byUpdated]
  return db
    .select(CLAIM_LIST_ROW)
    .from(drClaims)
    .where(and(email === null ? undefined : eq(drClaims.email, email), matchesSearch(q)))
    .orderBy(...order)
    .limit(limit)
    .offset(offset)
}

export function listClaims(db: Db, opts: ListOpts = {}): Promise<ClaimListRow[]> {
  return listClaimPage(db, null, opts)
}

export async function countClaims(db: Db, opts: { query?: unknown } = {}) {
  const [row] = await db
    .select({ count: count() })
    .from(drClaims)
    .where(matchesSearch(normalizeSearchQuery(opts.query)))
  return row?.count ?? 0
}

// Every claim row, by domain, a page at a time (export tooling).
export function listClaimRows(
  db: Db,
  opts: { limit?: number; offset?: number } = {}
): Promise<ClaimRow[]> {
  const limit = isFiniteNumber(opts.limit) ? Math.max(1, Math.min(1000, opts.limit)) : 500
  const offset = isFiniteNumber(opts.offset) ? Math.max(0, opts.offset) : 0
  return db
    .select(CLAIM_ROW)
    .from(drClaims)
    .orderBy(asc(drClaims.domain))
    .limit(limit)
    .offset(offset)
}

// One email's claims. The email is matched exactly after trimming and lowercasing it.
export async function listClaimsByEmail(
  db: Db,
  opts: ListOpts & { email: unknown }
): Promise<ClaimListRow[]> {
  const email = normalizeEmail(opts.email)
  if (!email) return []
  return listClaimPage(db, email, opts)
}

export async function countClaimsByEmail(db: Db, opts: { email: unknown; query?: unknown }) {
  const email = normalizeEmail(opts.email)
  if (!email) return 0
  const [row] = await db
    .select({ count: count() })
    .from(drClaims)
    .where(and(eq(drClaims.email, email), matchesSearch(normalizeSearchQuery(opts.query))))
  return row?.count ?? 0
}
