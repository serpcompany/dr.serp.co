// The sites queries on a database migrated by Wrangler, with edge-case values.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { recordDrCheck } from './checks'
import { type Db, dbFrom } from './client'
import { type LocalD1, openMigratedLocalD1 } from './local-d1'
import { countSites, listSites, purgeInvalidSiteDomains } from './sites'

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
  await d1.batch([d1.prepare('DELETE FROM dr_claims'), d1.prepare('DELETE FROM dr_checks')])
})

describe('sites queries', () => {
  it('purges only the requested domains that are invalid, with their checks', async () => {
    await recordDrCheck(db, { domain: 'phpinfo.php', domainRating: 9 })
    await recordDrCheck(db, { domain: 'bestcasinos.com', domainRating: 9 })
    await recordDrCheck(db, { domain: 'ok.com', domainRating: 9 })

    const result = await purgeInvalidSiteDomains(db, {
      domains: [' PHPINFO.php ', 'bestcasinos.com', 'ok.com', ''],
      dryRun: false
    })

    expect(result).toEqual({
      claimCount: 0,
      checkCount: 1,
      domains: ['phpinfo.php'],
      dryRun: false
    })
    expect(await countSites(db)).toBe(1)
  })

  it('searches with a 100-character emoji query without D1 refusing it', async () => {
    await recordDrCheck(db, { domain: 'example.com', domainRating: 9 })
    const query = '😀'.repeat(150)

    expect(await listSites(db, { query })).toEqual([])
    expect(await countSites(db, { query })).toBe(0)
  })

  it('answers an empty page past the offset cap without querying a huge OFFSET', async () => {
    await recordDrCheck(db, { domain: 'example.com', domainRating: 9 })

    expect(await listSites(db, { offset: 1e20 })).toEqual([])
    expect(await listSites(db, { offset: -5, limit: 1000 })).toHaveLength(1)
  })

  it('orders by the latest change, newest first, then by domain', async () => {
    await recordDrCheck(db, { domain: 'old.com', domainRating: 90, checkedAt: '2026-01-01' })
    await recordDrCheck(db, { domain: 'new.com', domainRating: 10, checkedAt: '2026-03-01' })
    await recordDrCheck(db, { domain: 'b-tie.com', domainRating: 50, checkedAt: '2026-02-01' })
    await recordDrCheck(db, { domain: 'a-tie.com', domainRating: 50, checkedAt: '2026-02-01' })
    // A claim updated after its last check counts from the claim's time.
    await d1
      .prepare('INSERT INTO dr_claims (domain, domain_rating, updated_at) VALUES (?, ?, ?)')
      .bind('old.com', 90, '2026-04-01T00:00:00.000Z')
      .run()

    const updated = await listSites(db, { sort: 'updated' })
    expect(updated.map(row => row.domain)).toEqual(['old.com', 'new.com', 'a-tie.com', 'b-tie.com'])
    expect(updated[0].updated_at).toBe('2026-04-01T00:00:00.000Z')
    expect((await listSites(db, { sort: 'dr' })).map(row => row.domain)).toEqual([
      'old.com',
      'a-tie.com',
      'b-tie.com',
      'new.com'
    ])
  })
})
