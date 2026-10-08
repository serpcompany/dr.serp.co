// The claims queries on a database migrated by Wrangler, with edge-case values.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  clearClaimEmail,
  countClaims,
  countClaimsByEmail,
  getClaim,
  listClaimRows,
  listClaims,
  listClaimsByEmail,
  setClaimEmail,
  setClaimSiteMetadata,
  touchDomain,
  upsertClaim
} from './claims'
import { type Db, dbFrom } from './client'
import { type LocalD1, openMigratedLocalD1 } from './local-d1'

let d1: LocalD1
let dispose: () => Promise<void>
let db: Db

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

async function insertClaim(
  domain: string,
  {
    email = null as string | null,
    rating = null as number | null,
    updatedAt = '2026-01-01T00:00:00.000Z'
  } = {}
) {
  await d1
    .prepare('INSERT INTO dr_claims (domain, email, domain_rating, updated_at) VALUES (?, ?, ?, ?)')
    .bind(domain, email, rating, updatedAt)
    .run()
}

beforeAll(async () => {
  ;({ d1, dispose } = await openMigratedLocalD1())
  db = dbFrom(d1 as unknown as D1Database)
}, 60_000)

afterAll(async () => {
  await dispose?.()
})

beforeEach(async () => {
  await d1.prepare('DELETE FROM dr_claims').all()
})

describe('claims queries', () => {
  it('reads a claim with every column, and null for an unknown domain', async () => {
    expect(await getClaim(db, 'missing.com')).toBeNull()

    const inserted = await upsertClaim(db, { domain: 'a.com', domainRating: 42.9 })
    const claim = await getClaim(db, 'a.com')

    expect(claim).toEqual(inserted)
    expect(claim).toEqual({
      domain: 'a.com',
      email: null,
      domain_rating: 42,
      provider: null,
      site_title: null,
      meta_description: null,
      site_url: null,
      screenshot_url: null,
      claimed_at: expect.stringMatching(ISO),
      updated_at: expect.stringMatching(ISO)
    })
  })

  it('upserts a reading by domain, keeping the owner when the new email is null', async () => {
    const first = await upsertClaim(db, {
      domain: 'a.com',
      email: 'owner@example.com',
      domainRating: 150,
      provider: 'ahrefs'
    })
    await setClaimSiteMetadata(db, { domain: 'a.com', siteTitle: 'A' })
    const second = await upsertClaim(db, { domain: 'a.com', domainRating: 'n/a', provider: null })

    expect(first).toMatchObject({ email: 'owner@example.com', domain_rating: 100 })
    // A rating that isn't a number is stored as NULL; the provider is replaced, even by NULL.
    expect(second).toMatchObject({
      email: 'owner@example.com',
      domain_rating: null,
      provider: null,
      site_title: 'A',
      claimed_at: first?.claimed_at
    })
    expect(second && first && second.updated_at >= first.updated_at).toBe(true)
    expect(await countClaims(db)).toBe(1)
  })

  it('sets an owner only on an unowned claim or the same email in any case', async () => {
    await upsertClaim(db, { domain: 'a.com', domainRating: 30, provider: 'ahrefs' })

    expect(await setClaimEmail(db, { domain: 'a.com', email: 'Owner@Example.com' })).toMatchObject({
      email: 'Owner@Example.com',
      domain_rating: 30,
      provider: 'ahrefs'
    })
    // The same owner in another case may set it again; a different owner gets null.
    expect(await setClaimEmail(db, { domain: 'a.com', email: 'owner@example.com' })).toMatchObject({
      email: 'owner@example.com'
    })
    expect(await setClaimEmail(db, { domain: 'a.com', email: 'thief@example.com' })).toBeNull()
    expect(await getClaim(db, 'a.com')).toMatchObject({ email: 'owner@example.com' })
    // A new domain is inserted with the email.
    expect(await setClaimEmail(db, { domain: 'new.com', email: 'x@example.com' })).toMatchObject({
      domain: 'new.com',
      email: 'x@example.com',
      domain_rating: null
    })
  })

  it('clears an owner only when the email matches after normalizing it', async () => {
    await insertClaim('a.com', { email: 'Owner@Example.com', rating: 40 })

    expect(await clearClaimEmail(db, { domain: ' a.com ', email: '' })).toBeNull()
    expect(await clearClaimEmail(db, { domain: '', email: 'owner@example.com' })).toBeNull()
    expect(await clearClaimEmail(db, { domain: 'a.com', email: 'other@example.com' })).toBeNull()
    expect(await getClaim(db, 'a.com')).toMatchObject({ email: 'Owner@Example.com' })

    const cleared = await clearClaimEmail(db, { domain: ' a.com ', email: ' OWNER@example.com ' })
    expect(cleared).toMatchObject({ domain: 'a.com', email: null, domain_rating: 40 })
    expect(cleared?.updated_at).not.toBe('2026-01-01T00:00:00.000Z')
    // Already cleared: lower(NULL) matches nothing.
    expect(await clearClaimEmail(db, { domain: 'a.com', email: 'owner@example.com' })).toBeNull()
  })

  it('touches a domain without changing anything but its update time', async () => {
    expect(await touchDomain(db, '   ')).toBeNull()
    expect(await touchDomain(db, null)).toBeNull()
    await insertClaim('a.com', { email: 'owner@example.com', rating: 7 })

    const touched = await touchDomain(db, ' a.com ')
    expect(touched).toMatchObject({ domain: 'a.com', email: 'owner@example.com', domain_rating: 7 })
    expect(touched?.updated_at).not.toBe('2026-01-01T00:00:00.000Z')
    expect(await touchDomain(db, 'b.com')).toMatchObject({ domain: 'b.com', email: null })
    expect(await countClaims(db)).toBe(2)
  })

  it('stores site metadata, keeping a stored field the update leaves null', async () => {
    expect(await setClaimSiteMetadata(db, { domain: ' ' })).toBeNull()
    await setClaimSiteMetadata(db, {
      domain: ' a.com ',
      siteTitle: 'Title',
      metaDescription: 'Description',
      siteUrl: 'https://a.com/',
      screenshotUrl: 'https://cdn.example.com/a.png'
    })

    expect(
      await setClaimSiteMetadata(db, { domain: 'a.com', siteTitle: 'New title', siteUrl: null })
    ).toMatchObject({
      domain: 'a.com',
      site_title: 'New title',
      meta_description: 'Description',
      site_url: 'https://a.com/',
      screenshot_url: 'https://cdn.example.com/a.png'
    })
  })

  it('lists claims by DR then latest change, nulls last, ties by domain', async () => {
    await insertClaim('null-rating.com', { updatedAt: '2026-05-01T00:00:00.000Z' })
    await insertClaim('b-tie.com', { rating: 50 })
    await insertClaim('a-tie.com', { rating: 50 })
    await insertClaim('newer.com', { rating: 50, updatedAt: '2026-02-01T00:00:00.000Z' })
    await insertClaim('top.com', { rating: 90 })

    expect((await listClaims(db)).map(row => row.domain)).toEqual([
      'top.com',
      'newer.com',
      'a-tie.com',
      'b-tie.com',
      'null-rating.com'
    ])
    expect((await listClaims(db, { sort: 'updated' })).map(row => row.domain)).toEqual([
      'null-rating.com',
      'newer.com',
      'a-tie.com',
      'b-tie.com',
      'top.com'
    ])
    expect(await listClaims(db, { limit: 1 })).toEqual([
      {
        domain: 'top.com',
        domain_rating: 90,
        updated_at: '2026-01-01T00:00:00.000Z',
        site_title: null,
        meta_description: null,
        site_url: null,
        screenshot_url: null
      }
    ])
  })

  it('clamps limit and offset, and answers empty past the offset cap', async () => {
    for (let index = 0; index < 105; index++) {
      await insertClaim(`site-${String(index).padStart(3, '0')}.com`, { rating: index % 101 })
    }

    expect(await listClaims(db, { limit: 1000 })).toHaveLength(100)
    expect(await listClaims(db, { limit: 0 })).toHaveLength(1)
    expect(await listClaims(db)).toHaveLength(25)
    expect(await listClaims(db, { offset: 104.7, limit: 5 })).toHaveLength(1)
    expect(await listClaims(db, { offset: -5, limit: 1 })).toEqual(
      await listClaims(db, { limit: 1 })
    )
    expect(await listClaims(db, { offset: Number.NaN, limit: 1 })).toHaveLength(1)
    expect(await listClaims(db, { offset: 100_000 })).toEqual([])
    expect(await listClaims(db, { offset: 1e20 })).toEqual([])
    expect(await countClaims(db)).toBe(105)
  }, 30_000)

  it('searches by a normalized, ASCII-folded substring of the domain', async () => {
    await insertClaim('Example.com', { email: 'owner@example.com' })
    await insertClaim('other.org', { email: 'owner@example.com' })

    expect((await listClaims(db, { query: '  EXAMPLE  ' })).map(row => row.domain)).toEqual([
      'Example.com'
    ])
    expect(await countClaims(db, { query: 'EXAMPLE' })).toBe(1)
    expect(await countClaims(db, { query: '   ' })).toBe(2)
    expect(await countClaims(db, { query: '😀'.repeat(150) })).toBe(0)
    expect(await listClaimsByEmail(db, { email: 'owner@example.com', query: 'org' })).toEqual([
      expect.objectContaining({ domain: 'other.org' })
    ])
    expect(await countClaimsByEmail(db, { email: 'owner@example.com', query: 'ORG' })).toBe(1)
  })

  it('lists and counts one email’s claims, matching the stored email exactly', async () => {
    await insertClaim('a.com', { email: 'owner@example.com', rating: 10 })
    await insertClaim('b.com', { email: 'owner@example.com', rating: 20 })
    await insertClaim('c.com', { email: 'other@example.com', rating: 30 })
    // Stored in mixed case (before emails were normalized): an exact match never finds it.
    await insertClaim('legacy.com', { email: 'Owner@Example.com', rating: 40 })
    await insertClaim('free.com', { rating: 50 })

    const rows = await listClaimsByEmail(db, { email: ' OWNER@example.com ' })
    expect(rows.map(row => row.domain)).toEqual(['b.com', 'a.com'])
    expect(await countClaimsByEmail(db, { email: ' OWNER@example.com ' })).toBe(2)
    expect(await listClaimsByEmail(db, { email: '  ' })).toEqual([])
    expect(await countClaimsByEmail(db, { email: null })).toBe(0)
    expect(
      await listClaimsByEmail(db, { email: 'owner@example.com', limit: 1, offset: 1 })
    ).toEqual([expect.objectContaining({ domain: 'a.com' })])
    expect(await listClaimsByEmail(db, { email: 'owner@example.com', offset: 1e20 })).toEqual([])
  })

  it('pages through every claim row by domain for export', async () => {
    await insertClaim('c.com', { email: 'c@example.com', rating: 3 })
    await insertClaim('a.com')
    await insertClaim('b.com', { rating: 2 })

    const rows = await listClaimRows(db)
    expect(rows.map(row => row.domain)).toEqual(['a.com', 'b.com', 'c.com'])
    expect(rows[2]).toEqual({
      domain: 'c.com',
      email: 'c@example.com',
      domain_rating: 3,
      provider: null,
      site_title: null,
      meta_description: null,
      site_url: null,
      screenshot_url: null,
      claimed_at: expect.stringMatching(ISO),
      updated_at: '2026-01-01T00:00:00.000Z'
    })
    expect((await listClaimRows(db, { limit: 1, offset: 1 })).map(row => row.domain)).toEqual([
      'b.com'
    ])
    expect(await listClaimRows(db, { limit: -10 })).toHaveLength(1)
    expect(await listClaimRows(db, { offset: 1e9 })).toEqual([])
  })
})
