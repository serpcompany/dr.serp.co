// Runs the data layer's real SQL against D1 on workerd (SQLite semantics, instr(), window
// functions, byte lengths), which the mock in db-d1.test.ts can't. Local workerd doesn't enforce
// D1's 50-byte LIKE limit; sql-patterns.test.ts guards that in the source. The database comes
// from src/db/local-d1.ts: every migration applied by Wrangler, in a temporary directory.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { openMigratedLocalD1 } from '@/db/local-d1'

const binding = vi.hoisted(() => ({ db: null as unknown }))

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: { DB: binding.db } })
}))

type D1 = {
  prepare: (sql: string) => { bind: (...values: unknown[]) => { run: () => Promise<unknown> } }
  batch: (statements: unknown[]) => Promise<unknown>
}

let dispose: (() => Promise<void>) | undefined
let d1: D1

async function insertClaim(domain: string, { email = null as string | null, rating = 50 } = {}) {
  await d1
    .prepare('INSERT INTO dr_claims (domain, email, domain_rating, updated_at) VALUES (?, ?, ?, ?)')
    .bind(domain, email, rating, '2026-10-01T00:00:00.000Z')
    .run()
}

beforeAll(async () => {
  const local = await openMigratedLocalD1()
  dispose = local.dispose
  d1 = local.d1 as unknown as D1
  binding.db = d1
}, 30_000)

afterAll(async () => {
  await dispose?.()
})

beforeEach(async () => {
  await d1.batch([d1.prepare('DELETE FROM dr_claims'), d1.prepare('DELETE FROM dr_checks')])
})

const longLabel = 'a'.repeat(60)
const longDomain = `${longLabel}.${longLabel}.com`

describe('site search on workerd D1', () => {
  it('finds a matching row for a 200-character search', async () => {
    await insertClaim(longDomain, { email: 'owner@example.com' })
    await insertClaim('example.com', { email: 'owner@example.com' })
    const db = await import('./db.mjs')
    // Capped at 100 characters, the query is the first 100 characters of the domain.
    const query = `${longDomain}${'b'.repeat(200)}`.slice(0, 200)

    expect(await db.listSites({ query })).toEqual([expect.objectContaining({ domain: longDomain })])
    expect(await db.countSites({ query })).toBe(1)
    expect(await db.listClaims({ query })).toEqual([
      expect.objectContaining({ domain: longDomain })
    ])
    expect(await db.countClaims({ query })).toBe(1)
    expect(await db.listClaimsByEmail({ email: 'owner@example.com', query })).toHaveLength(1)
    expect(await db.countClaimsByEmail({ email: 'owner@example.com', query })).toBe(1)
  })

  it('finds a matching row for a CJK search longer than 50 bytes', async () => {
    // Domains are stored in punycode now; this is a row from before validation existed.
    const cjk = '例'.repeat(20)
    await insertClaim(`${cjk}.jp`, { email: 'owner@example.com' })
    await insertClaim('example.com', { email: 'owner@example.com' })
    const db = await import('./db.mjs')

    expect(await db.listClaims({ query: cjk })).toEqual([
      expect.objectContaining({ domain: `${cjk}.jp` })
    ])
    expect(await db.countClaims({ query: cjk })).toBe(1)
    expect(await db.listClaimsByEmail({ email: 'owner@example.com', query: cjk })).toHaveLength(1)
    // The site list hides the invalid domain, but the search still answers.
    expect(await db.listSites({ query: cjk })).toEqual([])
    expect(await db.countSites({ query: cjk })).toBe(0)
  })

  it('folds ASCII case and collapses whitespace', async () => {
    await insertClaim('example.com')
    const db = await import('./db.mjs')

    expect(await db.listSites({ query: '  EXAMPLE  ' })).toEqual([
      expect.objectContaining({ domain: 'example.com' })
    ])
  })

  it('fills a page past unlistable rows and counts only listable ones', async () => {
    await insertClaim('best-casino.com', { rating: 90 })
    await insertClaim('phpinfo.php', { rating: 80 })
    await insertClaim('example.com', { rating: 70 })
    await insertClaim('example.org', { rating: 60 })
    const db = await import('./db.mjs')

    expect((await db.listSites({ limit: 1 })).map((row: { domain: string }) => row.domain)).toEqual(
      ['example.com']
    )
    expect(
      (await db.listSites({ limit: 1, offset: 1 })).map((row: { domain: string }) => row.domain)
    ).toEqual(['example.org'])
    expect(await db.countSites({})).toBe(2)
  })

  it('reads past more unlistable rows than the slack, so pagination stays exact', async () => {
    const spam = Array.from({ length: 250 }, (_, index) =>
      d1
        .prepare('INSERT INTO dr_claims (domain, domain_rating, updated_at) VALUES (?, ?, ?)')
        .bind(`casino-${index}.com`, 99, '2026-10-01T00:00:00.000Z')
    )
    await d1.batch(spam)
    await insertClaim('example.com', { rating: 70 })
    await insertClaim('example.org', { rating: 60 })
    const db = await import('./db.mjs')

    expect((await db.listSites({ limit: 1 })).map((row: { domain: string }) => row.domain)).toEqual(
      ['example.com']
    )
    expect(
      (await db.listSites({ limit: 1, offset: 1 })).map((row: { domain: string }) => row.domain)
    ).toEqual(['example.org'])
    expect(await db.listSites({ limit: 1, offset: 2 })).toEqual([])
    expect(await db.countSites({})).toBe(2)
  })

  it('answers an empty page for an offset past the cap, never the capped page', async () => {
    await insertClaim('example.com', { email: 'owner@example.com' })
    const db = await import('./db.mjs')

    // 100,000 is the last offset served. Past it the page is empty without a query, rather than
    // the page at 100,000.
    // Miniflare's binding can't be spied on, so count queries through a wrapper.
    const prepare = vi.fn((sql: string) => d1.prepare(sql))
    binding.db = { prepare, batch: (statements: unknown[]) => d1.batch(statements) }
    try {
      expect(await db.listSites({ offset: 100_001 })).toEqual([])
      expect(await db.listClaims({ offset: 100_001 })).toEqual([])
      expect(await db.listClaimsByEmail({ email: 'owner@example.com', offset: 100_001 })).toEqual(
        []
      )
      expect(prepare).not.toHaveBeenCalled()
      expect(await db.listSites({ offset: 100_000 })).toEqual([])
      expect(prepare).toHaveBeenCalled()
    } finally {
      binding.db = d1
    }

    expect(await db.listSites({ offset: 1e20 })).toEqual([])
    expect(await db.listClaims({ offset: 1e20 })).toEqual([])
    expect(await db.listClaimsByEmail({ email: 'owner@example.com', offset: 1e20 })).toEqual([])
  })
})

describe('sitemap sites on workerd D1', () => {
  it('lists each listable site once, with its last check as the change time', async () => {
    await insertClaim('example.com', { rating: 70 })
    await insertClaim('best-casino.com', { rating: 90 })
    await insertClaim('phpinfo.php', { rating: 80 })
    await d1
      .prepare(
        'INSERT INTO dr_checks (domain, domain_rating, provider, checked_at) VALUES (?, ?, ?, ?)'
      )
      .bind('example.com', 71, 'ahrefs', '2026-10-05T00:00:00.000Z')
      .run()
    await d1
      .prepare(
        'INSERT INTO dr_checks (domain, domain_rating, provider, checked_at) VALUES (?, ?, ?, ?)'
      )
      .bind('checked-only.org', 40, 'ahrefs', '2026-09-01T00:00:00.000Z')
      .run()
    const db = await import('./db.mjs')

    await insertClaim('claimed-only.net', { rating: 30 })

    // claimed-only.net has no check, so no lastmod; its claim's updated_at doesn't count.
    expect(await db.listSitemapSites()).toEqual([
      { domain: 'checked-only.org', updated_at: '2026-09-01T00:00:00.000Z' },
      { domain: 'claimed-only.net', updated_at: null },
      { domain: 'example.com', updated_at: '2026-10-05T00:00:00.000Z' }
    ])
  })
})
