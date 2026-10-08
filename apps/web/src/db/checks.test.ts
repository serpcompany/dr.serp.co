// The checks queries on a database migrated by Wrangler, with edge-case values.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDrChecks, listDrChecks, recordDrCheck, recordDrHistoryChecks } from './checks'
import { type Db, dbFrom } from './client'
import { type LocalD1, openMigratedLocalD1 } from './local-d1'

let d1: LocalD1
let dispose: () => Promise<void>
let db: Db

beforeAll(async () => {
  ;({ d1, dispose } = await openMigratedLocalD1())
  db = dbFrom(d1 as unknown as D1Database)
}, 60_000)

afterAll(async () => {
  await dispose?.()
})

beforeEach(async () => {
  await d1.prepare('DELETE FROM dr_checks').all()
})

describe('checks queries', () => {
  it('clamps a reading into 0–100 and skips one that is not a number', async () => {
    expect(await recordDrCheck(db, { domain: 'a.com', domainRating: 150 })).toMatchObject({
      domain: 'a.com',
      domain_rating: 100,
      provider: null
    })
    expect(await recordDrCheck(db, { domain: 'a.com', domainRating: -3.7 })).toMatchObject({
      domain_rating: 0
    })
    expect(await recordDrCheck(db, { domain: 'a.com', domainRating: 'n/a' })).toBeNull()
    expect(await getDrChecks(db, 'a.com')).toHaveLength(2)
  })

  it('stores an invalid check time as now, in ISO text', async () => {
    const row = await recordDrCheck(db, { domain: 'a.com', domainRating: 5, checkedAt: 'never' })

    expect(row?.checked_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('replaces a history point with the same provider and time, NULL provider included', async () => {
    for (const [provider, rating] of [
      [null, 10],
      [null, 12],
      ['ahrefs-history', 30],
      ['ahrefs-history', 32]
    ] as const) {
      await recordDrHistoryChecks(db, {
        domain: 'h.com',
        provider,
        points: [{ checkedAt: '2026-01-01', domainRating: rating }]
      })
    }
    // Points without a usable rating or date are dropped.
    expect(
      await recordDrHistoryChecks(db, {
        domain: 'h.com',
        points: [{ checkedAt: 'not a date', domainRating: 5 }, { checkedAt: '2026-02-01' }]
      })
    ).toEqual([])

    const checks = await getDrChecks(db, 'h.com', { limit: 10 })
    expect(checks).toHaveLength(2)
    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ domain_rating: 12, provider: null }),
        expect.objectContaining({ domain_rating: 32, provider: 'ahrefs-history' })
      ])
    )
  })

  it('returns the most recent readings oldest first, capped at 365', async () => {
    const points = Array.from({ length: 400 }, (_, day) => ({
      checkedAt: new Date(Date.UTC(2025, 0, 1 + day)).toISOString(),
      domainRating: day % 101
    }))
    await recordDrHistoryChecks(db, { domain: 'long.com', points })

    const capped = await getDrChecks(db, 'long.com', { limit: 10_000 })
    expect(capped).toHaveLength(365)
    expect(capped[0].checked_at < capped[364].checked_at).toBe(true)
    expect(capped[364].checked_at).toBe(points[399].checkedAt)
    expect(await getDrChecks(db, 'long.com')).toHaveLength(60)
  }, 60_000)

  it('pages through every reading in time order, filtered by domain', async () => {
    await recordDrCheck(db, { domain: 'b.com', domainRating: 1, checkedAt: '2026-01-02' })
    await recordDrCheck(db, { domain: 'a.com', domainRating: 2, checkedAt: '2026-01-01' })
    await recordDrCheck(db, { domain: 'a.com', domainRating: 3, checkedAt: '2026-01-03' })

    expect((await listDrChecks(db)).map(row => row.domain_rating)).toEqual([2, 1, 3])
    expect(
      (await listDrChecks(db, { domain: 'a.com', limit: 1, offset: 1 })).map(r => r.domain_rating)
    ).toEqual([3])
    expect(await listDrChecks(db, { offset: 1e9 })).toEqual([])
  })
})
