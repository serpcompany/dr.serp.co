// The site directory: every domain with a claim or a check, its latest DR and metadata. Listing
// and counting filter with the JavaScript rules in listable.ts.
import { count, eq, sql } from 'drizzle-orm'
import { isValidDomainTarget } from '@/server/domain-target.mjs'
import type { Db } from './client'

import { isListableSiteRow, isPurgeableSiteRow, normalizeSearchQuery } from './listable'
import { drChecks, drClaims } from './schema'
import { clampOffset, isFiniteNumber, isoText } from './values'

export type SiteRow = {
  domain: string
  domain_rating: number | null
  site_title: string | null
  meta_description: string | null
  site_url: string | null
  screenshot_url: string | null
  updated_at: string | null
}

// Deeper pages answer empty, so an unbounded offset never reaches SQL, where D1 refuses a value
// past 64 bits.
const MAX_LIST_OFFSET = 100_000
// Rows past the requested page read first, so a page stays full when some stored rows are
// unlistable. When more than that precede the page, the read grows.
const LISTABLE_SCAN_SLACK = 200

// One row per domain: the latest check's DR (else the claim's) and the later of the check and
// claim times. q is a normalized search or null; rows come in the requested order.
function siteRowsQuery(q: string | null, sort: 'dr' | 'updated', scan: number) {
  const order =
    sort === 'updated'
      ? sql`updated_at IS NULL ASC, updated_at DESC, domain ASC`
      : sql`domain_rating IS NULL ASC, domain_rating DESC, updated_at IS NULL ASC, updated_at DESC, domain ASC`
  return sql`
    WITH domains AS (
      SELECT domain FROM dr_claims
      UNION
      SELECT domain FROM dr_checks
    ),
    latest_checks AS (
      SELECT domain, domain_rating, checked_at AS updated_at
      FROM (
        SELECT
          domain,
          domain_rating,
          checked_at,
          id,
          ROW_NUMBER() OVER (PARTITION BY domain ORDER BY checked_at DESC, id DESC) AS rn
        FROM dr_checks
      )
      WHERE rn = 1
    ),
    site_rows AS (
      SELECT
        d.domain,
        COALESCE(c.domain_rating, cl.domain_rating) AS domain_rating,
        cl.site_title,
        cl.meta_description,
        cl.site_url,
        cl.screenshot_url,
        CASE
          WHEN c.updated_at IS NULL THEN cl.updated_at
          WHEN cl.updated_at IS NULL THEN c.updated_at
          WHEN c.updated_at > cl.updated_at THEN c.updated_at
          ELSE cl.updated_at
        END AS updated_at
      FROM domains d
      LEFT JOIN latest_checks c ON c.domain = d.domain
      LEFT JOIN dr_claims cl ON cl.domain = d.domain
      WHERE (${q} IS NULL OR instr(lower(d.domain), ${q}) > 0)
    )
    SELECT domain, domain_rating, site_title, meta_description, site_url, screenshot_url, updated_at
    FROM site_rows
    ORDER BY ${order}
    LIMIT ${scan}
  `
}

export async function listSites(
  db: Db,
  opts: { query?: unknown; limit?: number; offset?: number; sort?: 'dr' | 'updated' } = {}
): Promise<SiteRow[]> {
  const q = normalizeSearchQuery(opts.query)
  const sort = opts.sort === 'updated' ? 'updated' : 'dr'
  const limit = isFiniteNumber(opts.limit) ? Math.max(1, Math.min(100, opts.limit)) : 25
  const offset = clampOffset(opts.offset)
  if (offset > MAX_LIST_OFFSET) return []

  // A bounded read: the rows up to the page plus slack, read further only when unlistable rows
  // leave the page short and more rows remain.
  let scan = offset + limit + LISTABLE_SCAN_SLACK
  for (;;) {
    const rawRows = await db.all<SiteRow>(siteRowsQuery(q, sort, scan))
    const rows = rawRows.filter(isListableSiteRow)
    const shortfall = offset + limit - rows.length
    if (shortfall <= 0 || rawRows.length < scan) return rows.slice(offset, offset + limit)
    // Grow geometrically, so a search whose matches are mostly unlistable costs a few queries.
    scan = Math.max(scan * 2, scan + shortfall + LISTABLE_SCAN_SLACK)
  }
}

type DomainRow = { domain: string; site_title: string | null; email: string | null }

function allSiteDomains(db: Db, q: string | null = null) {
  return db.all<DomainRow>(sql`
    SELECT d.domain, cl.site_title, cl.email
    FROM (
      SELECT domain FROM dr_claims
      UNION
      SELECT domain FROM dr_checks
    ) d
    LEFT JOIN dr_claims cl ON cl.domain = d.domain
    WHERE (${q} IS NULL OR instr(lower(d.domain), ${q}) > 0)
  `)
}

export async function countSites(db: Db, opts: { query?: unknown } = {}) {
  const rows = await allSiteDomains(db, normalizeSearchQuery(opts.query))
  return rows.filter(isListableSiteRow).length
}

// Every listable site for the sitemap, with its last DR check as lastmod (not the claim's
// updated_at, which rendering a page can stamp). The sitemap route caps the list per file.
export async function listSitemapSites(db: Db) {
  const rows = await db.all<{
    domain: string
    site_title: string | null
    updated_at: string | null
  }>(
    sql`
      WITH domains AS (
        SELECT domain FROM dr_claims
        UNION
        SELECT domain FROM dr_checks
      ),
      last_checks AS (
        SELECT domain, MAX(checked_at) AS checked_at FROM dr_checks GROUP BY domain
      )
      SELECT d.domain, cl.site_title, lc.checked_at AS updated_at
      FROM domains d
      LEFT JOIN last_checks lc ON lc.domain = d.domain
      LEFT JOIN dr_claims cl ON cl.domain = d.domain
      ORDER BY d.domain
    `
  )
  return rows
    .filter(isListableSiteRow)
    .map(row => ({ domain: row.domain, updated_at: isoText(row.updated_at) }))
}

// Deletes invalid domains and unclaimed spam sites (or only the given invalid domains), with
// their checks. A dry run only counts.
export async function purgeInvalidSiteDomains(
  db: Db,
  opts: { domains?: string[]; dryRun?: boolean } = {}
) {
  const dryRun = opts.dryRun !== false
  const domains = Array.isArray(opts.domains)
    ? Array.from(
        new Set(
          opts.domains
            .map(domain =>
              String(domain ?? '')
                .trim()
                .toLowerCase()
            )
            // Requested domains are purged only when invalid.
            .filter(domain => domain && !isValidDomainTarget(domain))
        )
      )
    : Array.from(
        new Set(
          (await allSiteDomains(db))
            .filter(isPurgeableSiteRow)
            .map(row => String(row.domain).trim().toLowerCase())
        )
      )

  let claimCount = 0
  let checkCount = 0
  for (const domain of domains) {
    const [claims] = await db
      .select({ count: count() })
      .from(drClaims)
      .where(eq(drClaims.domain, domain))
    const [checks] = await db
      .select({ count: count() })
      .from(drChecks)
      .where(eq(drChecks.domain, domain))
    claimCount += claims?.count ?? 0
    checkCount += checks?.count ?? 0
  }

  if (!dryRun) {
    for (const domain of domains) {
      await db.batch([
        db.delete(drChecks).where(eq(drChecks.domain, domain)),
        db.delete(drClaims).where(eq(drClaims.domain, domain))
      ])
    }
  }

  return { claimCount, checkCount, domains, dryRun }
}
