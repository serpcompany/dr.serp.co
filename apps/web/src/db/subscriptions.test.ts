// The subscriptions queries on a database migrated by Wrangler, with edge-case values.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { type Db, dbFrom } from './client'
import { type LocalD1, openMigratedLocalD1 } from './local-d1'
import {
  getActiveSubscriptionByEmail,
  getLatestSubscriptionByEmail,
  listSubscriptions,
  upsertSubscription
} from './subscriptions'

let d1: LocalD1
let dispose: () => Promise<void>
let db: Db

const FUTURE = '2999-01-01T00:00:00.000Z'
const PAST = '2000-01-01T00:00:00.000Z'

async function insertSubscription(
  id: string,
  {
    email = 'owner@example.com',
    status = 'active' as string | null,
    periodEnd = FUTURE as string | null,
    cancel = null as number | null,
    updatedAt = '2026-01-01T00:00:00.000Z'
  } = {}
) {
  await d1
    .prepare(
      `INSERT INTO dr_subscriptions
        (email, stripe_subscription_id, status, current_period_end, cancel_at_period_end, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(email, id, status, periodEnd, cancel, updatedAt)
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
  await d1.prepare('DELETE FROM dr_subscriptions').all()
})

describe('subscriptions queries', () => {
  it('skips a subscription without an email or ID', async () => {
    expect(await upsertSubscription(db, { email: '  ', stripeSubscriptionId: 'sub_1' })).toBeNull()
    expect(
      await upsertSubscription(db, { email: 'a@example.com', stripeSubscriptionId: ' ' })
    ).toBeNull()
    expect(await upsertSubscription(db, { email: null, stripeSubscriptionId: null })).toBeNull()
    expect(await listSubscriptions(db)).toEqual([])
  })

  it('inserts with a normalized email, ISO period end and boolean cancel flag', async () => {
    const row = await upsertSubscription(db, {
      email: '  Billing@Example.COM ',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: ' sub_1 ',
      stripePriceId: 'price_1',
      billingInterval: 'monthly',
      domainsLimit: 0,
      status: 'active',
      currentPeriodEnd: new Date('2999-01-01T00:00:00Z'),
      cancelAtPeriodEnd: true
    })

    expect(row).toEqual({
      email: 'billing@example.com',
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
      stripe_price_id: 'price_1',
      billing_interval: 'monthly',
      domains_limit: 0,
      status: 'active',
      current_period_end: FUTURE,
      cancel_at_period_end: true,
      created_at: expect.any(String),
      updated_at: expect.any(String)
    })
  })

  it('stores an unknown cancel flag and an invalid period end as NULL', async () => {
    const row = await upsertSubscription(db, {
      email: 'a@example.com',
      stripeSubscriptionId: 'sub_1',
      currentPeriodEnd: 'not a date'
    })

    expect(row).toMatchObject({
      cancel_at_period_end: null,
      current_period_end: null,
      status: null
    })
  })

  it('updates by subscription ID, keeping stored fields the event leaves null', async () => {
    const first = await upsertSubscription(db, {
      email: 'a@example.com',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      stripePriceId: 'price_1',
      billingInterval: 'yearly',
      domainsLimit: 25,
      status: 'active',
      currentPeriodEnd: FUTURE,
      cancelAtPeriodEnd: true
    })
    const second = await upsertSubscription(db, {
      email: 'B@example.com',
      stripeSubscriptionId: 'sub_1',
      status: 'canceled',
      cancelAtPeriodEnd: false
    })

    expect(second).toEqual({
      ...first,
      email: 'b@example.com',
      status: 'canceled',
      cancel_at_period_end: false,
      updated_at: expect.any(String)
    })
    expect(await listSubscriptions(db)).toHaveLength(1)
  })

  it('finds the latest active or trialing subscription that has not ended', async () => {
    await insertSubscription('sub_old', { updatedAt: '2026-01-01T00:00:00.000Z', cancel: 0 })
    await insertSubscription('sub_trial', {
      status: 'trialing',
      periodEnd: null,
      updatedAt: '2026-02-01T00:00:00.000Z',
      cancel: 1
    })
    await insertSubscription('sub_ended', {
      periodEnd: PAST,
      updatedAt: '2026-03-01T00:00:00.000Z'
    })
    await insertSubscription('sub_canceled', {
      status: 'canceled',
      updatedAt: '2026-04-01T00:00:00.000Z'
    })
    await insertSubscription('sub_null_status', {
      status: null,
      updatedAt: '2026-05-01T00:00:00.000Z'
    })

    expect(await getActiveSubscriptionByEmail(db, ' OWNER@example.com ')).toMatchObject({
      stripe_subscription_id: 'sub_trial',
      current_period_end: null,
      cancel_at_period_end: true
    })
    expect(await getLatestSubscriptionByEmail(db, 'Owner@Example.com')).toMatchObject({
      stripe_subscription_id: 'sub_null_status',
      cancel_at_period_end: null
    })
    expect(await getActiveSubscriptionByEmail(db, '')).toBeNull()
    expect(await getLatestSubscriptionByEmail(db, null)).toBeNull()
    expect(await getActiveSubscriptionByEmail(db, 'nobody@example.com')).toBeNull()
  })

  it('reads a stored 0 as false', async () => {
    await insertSubscription('sub_1', { cancel: 0 })

    expect(await getActiveSubscriptionByEmail(db, 'owner@example.com')).toMatchObject({
      cancel_at_period_end: false
    })
  })

  it('lists subscriptions newest first, filtered by email, with clamped paging', async () => {
    for (let index = 0; index < 205; index++) {
      await insertSubscription(`sub_${index}`, {
        email: index % 2 ? 'odd@example.com' : 'even@example.com',
        updatedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString()
      })
    }

    const all = await listSubscriptions(db)
    expect(all).toHaveLength(100)
    expect(all[0].stripe_subscription_id).toBe('sub_204')
    expect(await listSubscriptions(db, { limit: 1000 })).toHaveLength(200)
    expect(await listSubscriptions(db, { limit: 0 })).toHaveLength(1)
    expect(
      (await listSubscriptions(db, { email: ' ODD@example.com ', limit: 2, offset: 1 })).map(
        row => row.stripe_subscription_id
      )
    ).toEqual(['sub_201', 'sub_199'])
    expect(await listSubscriptions(db, { offset: -1, limit: 1 })).toEqual(
      await listSubscriptions(db, { limit: 1 })
    )
    expect(await listSubscriptions(db, { offset: 1e9 })).toEqual([])
    // An email that normalizes to nothing matches no row rather than every row.
    expect(await listSubscriptions(db, { email: '   ' })).toEqual([])
    expect(await listSubscriptions(db, { email: '' })).toHaveLength(100)
  }, 30_000)
})
