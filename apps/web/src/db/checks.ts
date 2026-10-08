// DR readings: one row per lookup, the source of the history chart and the recheck cadence.
import { and, asc, desc, eq, isNull } from 'drizzle-orm'

import type { Db } from './client'
import { drChecks } from './schema'
import { clampDr, coerceDate, isFiniteNumber, isoText, nowIsoText } from './values'

export type CheckRow = {
  id: number
  domain: string
  domain_rating: number
  provider: string | null
  checked_at: string
}

const CHECK_ROW = {
  id: drChecks.id,
  domain: drChecks.domain,
  domain_rating: drChecks.domainRating,
  provider: drChecks.provider,
  checked_at: drChecks.checkedAt
}

export async function recordDrCheck(
  db: Db,
  input: {
    domain: string
    domainRating: unknown
    provider?: string | null
    checkedAt?: Date | string | null
  }
): Promise<CheckRow | null> {
  const domainRating = clampDr(input.domainRating)
  if (domainRating === null) return null
  const [row] = await db
    .insert(drChecks)
    .values({
      domain: input.domain,
      domainRating,
      provider: input.provider ?? null,
      checkedAt: isoText(input.checkedAt, nowIsoText()) ?? nowIsoText()
    })
    .returning(CHECK_ROW)
  return row ?? null
}

export type HistoryPoint = {
  domainRating?: unknown
  domain_rating?: unknown
  checkedAt?: Date | string | null
  checked_at?: Date | string | null
  provider?: string | null
}

// Historical points replace an existing row with the same domain, provider and time instead of
// adding a duplicate. Each point's delete and insert run as one batch (one D1 transaction).
export async function recordDrHistoryChecks(
  db: Db,
  input: { domain: string; points: HistoryPoint[]; provider?: string | null }
): Promise<CheckRow[]> {
  const domain = String(input.domain ?? '').trim()
  const fallbackProvider = input.provider === undefined ? 'ahrefs-history' : input.provider
  if (!domain || !Array.isArray(input.points) || input.points.length === 0) return []

  const points = input.points.flatMap(point => {
    const domainRating = clampDr(point?.domainRating ?? point?.domain_rating)
    const checkedAt = coerceDate(point?.checkedAt ?? point?.checked_at)
    if (domainRating === null || !checkedAt) return []
    return [{ domainRating, provider: point?.provider ?? fallbackProvider ?? null, checkedAt }]
  })

  const recorded: CheckRow[] = []
  for (const point of points) {
    const checkedAt = point.checkedAt.toISOString()
    const [, inserted] = await db.batch([
      db
        .delete(drChecks)
        .where(
          and(
            eq(drChecks.domain, domain),
            point.provider === null
              ? isNull(drChecks.provider)
              : eq(drChecks.provider, point.provider),
            eq(drChecks.checkedAt, checkedAt)
          )
        ),
      db
        .insert(drChecks)
        .values({ domain, domainRating: point.domainRating, provider: point.provider, checkedAt })
        .returning(CHECK_ROW)
    ])
    if (inserted[0]) recorded.push(inserted[0])
  }
  return recorded
}

// The most recent readings for a domain, oldest first.
export async function getDrChecks(db: Db, domain: string, opts: { limit?: number } = {}) {
  const limit = isFiniteNumber(opts.limit) ? Math.max(1, Math.min(365, opts.limit)) : 60
  const rows = await db
    .select({
      domain_rating: drChecks.domainRating,
      provider: drChecks.provider,
      checked_at: drChecks.checkedAt
    })
    .from(drChecks)
    .where(eq(drChecks.domain, domain))
    .orderBy(desc(drChecks.checkedAt))
    .limit(limit)
  return rows.reverse()
}

// Every reading, oldest first, a page at a time (export tooling).
export async function listDrChecks(
  db: Db,
  opts: { domain?: string | null; limit?: number; offset?: number } = {}
) {
  const domain = String(opts.domain ?? '').trim() || null
  const limit = isFiniteNumber(opts.limit) ? Math.max(1, Math.min(1000, opts.limit)) : 500
  const offset = isFiniteNumber(opts.offset) ? Math.max(0, opts.offset) : 0
  return db
    .select({
      domain: drChecks.domain,
      domain_rating: drChecks.domainRating,
      provider: drChecks.provider,
      checked_at: drChecks.checkedAt
    })
    .from(drChecks)
    .where(domain ? eq(drChecks.domain, domain) : undefined)
    .orderBy(asc(drChecks.checkedAt), asc(drChecks.id))
    .limit(limit)
    .offset(offset)
}
