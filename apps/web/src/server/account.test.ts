// The account pages' loader against D1 on workerd: claims, a year of readings per site (split
// into statements of at most 90 domains), month changes, the weekly average and the plan.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { openMigratedLocalD1 } from '@/db/local-d1'

const binding = vi.hoisted(() => ({ db: null as unknown }))
const resolveEntitlement = vi.hoisted(() => vi.fn())

vi.mock('server-only', () => ({}))
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: { DB: binding.db } })
}))
vi.mock('@/server/entitlements.mjs', () => ({ resolveEntitlement }))
vi.mock('@/server/auth/session', () => ({ getSessionEmail: async () => null }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`)
  }
}))

const { loadAccount, planOf, requireAccount } = await import('./account')

type D1 = {
  prepare: (sql: string) => { bind: (...values: unknown[]) => { run: () => Promise<unknown> } }
  exec: (sql: string) => Promise<unknown>
}

let dispose: (() => Promise<void>) | undefined
let d1: D1
const NOW = new Date('2026-10-07T12:00:00.000Z')

async function claim(domain: string, email: string | null, rating: number | null) {
  await d1
    .prepare('INSERT INTO dr_claims (domain, email, domain_rating, updated_at) VALUES (?, ?, ?, ?)')
    .bind(domain, email, rating, '2026-10-01T00:00:00.000Z')
    .run()
}

async function check(domain: string, rating: number, day: string) {
  await d1
    .prepare(
      'INSERT INTO dr_checks (domain, domain_rating, provider, checked_at) VALUES (?, ?, ?, ?)'
    )
    .bind(domain, rating, 'test', `${day}T00:00:00.000Z`)
    .run()
}

const ACTIVE = {
  canAccessPaidFeatures: true,
  canClaim: true,
  isUnlimited: false,
  status: 'active',
  domainsLimit: 25,
  subscription: {
    billingInterval: 'monthly',
    currentPeriodEnd: new Date('2026-11-09T00:00:00.000Z'),
    cancelAtPeriodEnd: false,
    domainsLimit: 25
  }
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
  await d1.exec('DELETE FROM dr_checks; DELETE FROM dr_claims;')
  resolveEntitlement.mockReset()
  resolveEntitlement.mockResolvedValue(ACTIVE)
})

describe('loadAccount', () => {
  it('lists the claimed sites by DR, with their history and month change', async () => {
    await claim('high.example', 'owner@example.com', 60)
    await claim('low.example', 'owner@example.com', 20)
    await claim('new.example', 'owner@example.com', null)
    await claim('theirs.example', 'other@example.com', 90)
    await check('high.example', 55, '2026-08-01')
    await check('high.example', 61, '2026-10-01')
    await check('low.example', 20, '2026-10-01')
    await check('theirs.example', 90, '2026-10-01')
    // Older than a year: left out of the history.
    await check('high.example', 10, '2025-09-01')

    const account = await loadAccount('owner@example.com', NOW)
    expect(account.sites.map(site => site.domain)).toEqual([
      'high.example',
      'low.example',
      'new.example'
    ])
    const [high, low, fresh] = account.sites
    expect(high).toMatchObject({ dr: 61, change: 6, checkedAt: '2026-10-01T00:00:00.000Z' })
    expect(high?.history.map(point => point.domainRating)).toEqual([55, 61])
    expect(low).toMatchObject({ dr: 20, change: null })
    expect(fresh).toMatchObject({ dr: null, change: null, history: [] })
    expect(account.average.at(-1)).toEqual({ date: '2026-10-07', average: 40.5 })
    expect(account.canClaim).toBe(true)
  })

  it('reads every site of a large account, across statements', async () => {
    for (let index = 0; index < 95; index++) {
      const domain = `site-${String(index).padStart(3, '0')}.example`
      await claim(domain, 'big@example.com', index)
      await check(domain, index, '2026-10-01')
    }
    const account = await loadAccount('big@example.com', NOW)
    expect(account.sites).toHaveLength(95)
    expect(account.sites.every(site => site.history.length === 1)).toBe(true)
  })
})

describe('planOf', () => {
  it('names an active plan with its price and renewal', () => {
    expect(planOf(ACTIVE as never)).toEqual({
      kind: 'active',
      domains: 25,
      interval: 'monthly',
      price: 7,
      periodEnd: '2026-11-09T00:00:00.000Z'
    })
  })

  it('tells ending, past-due, unlimited and no plan apart', () => {
    expect(
      planOf({
        ...ACTIVE,
        subscription: { ...ACTIVE.subscription, cancelAtPeriodEnd: true }
      } as never).kind
    ).toBe('ending')
    expect(
      planOf({ ...ACTIVE, canAccessPaidFeatures: false, status: 'past_due' } as never).kind
    ).toBe('past-due')
    expect(planOf({ ...ACTIVE, isUnlimited: true } as never)).toMatchObject({
      kind: 'active',
      domains: null
    })
    expect(planOf(null).kind).toBe('free')
    expect(
      planOf({
        ...ACTIVE,
        canAccessPaidFeatures: false,
        status: 'none',
        subscription: null
      } as never).kind
    ).toBe('free')
  })
})

describe('requireAccount', () => {
  it('sends a signed-out visitor to /login and back to the page they asked for', async () => {
    await expect(requireAccount('/account/sites?site=best.serp.co')).rejects.toThrow(
      'REDIRECT /login?callbackUrl=%2Faccount%2Fsites%3Fsite%3Dbest.serp.co'
    )
    await expect(requireAccount('/account')).rejects.toThrow('REDIRECT /login')
  })
})
