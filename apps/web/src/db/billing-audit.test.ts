// The billing audit queries on a database migrated by Wrangler, with edge-case values.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  billingAuditCutoff,
  countPrunableBillingAudit,
  getLatestBillingAuditEvent,
  insertBillingAudit,
  listBillingAudit,
  pruneBillingAudit
} from './billing-audit'
import { type Db, dbFrom } from './client'
import { type LocalD1, openMigratedLocalD1 } from './local-d1'

let d1: LocalD1
let dispose: () => Promise<void>
let db: Db

const TYPE = 'customer.subscription.updated'
const DAY = 24 * 60 * 60 * 1000

async function insertRow(eventId: string | null, createdAt: string, success: number | null = 1) {
  await d1
    .prepare(
      'INSERT INTO dr_billing_audit (stripe_event_id, stripe_event_type, success, created_at) VALUES (?, ?, ?, ?)'
    )
    .bind(eventId, TYPE, success, createdAt)
    .run()
}

async function eventIds() {
  return (await listBillingAudit(db)).map(row => row.stripe_event_id)
}

beforeAll(async () => {
  ;({ d1, dispose } = await openMigratedLocalD1())
  db = dbFrom(d1 as unknown as D1Database)
}, 60_000)

afterAll(async () => {
  await dispose?.()
})

beforeEach(async () => {
  await d1.prepare('DELETE FROM dr_billing_audit').all()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('billing audit queries', () => {
  it('skips an event without a type', async () => {
    expect(await insertBillingAudit(db, { stripeEventType: '' })).toBeNull()
    expect(await listBillingAudit(db)).toEqual([])
  })

  it('logs an event with a normalized email, ISO times and booleans', async () => {
    const row = await insertBillingAudit(db, {
      stripeEventId: 'evt_1',
      stripeEventType: TYPE,
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      stripePriceId: 'price_1',
      email: ' Billing@Example.com ',
      billingInterval: 'monthly',
      domainsLimit: 25,
      status: 'active',
      currentPeriodEnd: new Date('2999-01-01T00:00:00Z'),
      cancelAtPeriodEnd: false,
      eventCreatedAt: '2023-11-14T22:13:20Z'
    })

    expect(row).toEqual({
      stripe_event_id: 'evt_1',
      stripe_event_type: TYPE,
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
      stripe_price_id: 'price_1',
      email: 'billing@example.com',
      billing_interval: 'monthly',
      domains_limit: 25,
      status: 'active',
      current_period_end: '2999-01-01T00:00:00.000Z',
      cancel_at_period_end: false,
      event_created_at: '2023-11-14T22:13:20.000Z',
      success: true,
      error: null,
      created_at: expect.any(String)
    })
  })

  it('stores success unless told otherwise, and an unknown cancel flag as NULL', async () => {
    expect(
      await insertBillingAudit(db, { stripeEventType: TYPE, email: '', success: null })
    ).toMatchObject({
      stripe_event_id: null,
      email: null,
      success: true,
      cancel_at_period_end: null
    })
    expect(
      await insertBillingAudit(db, { stripeEventType: TYPE, success: false, error: 'boom' })
    ).toMatchObject({ success: false, error: 'boom' })
  })

  it('updates a replayed event by its ID, and clears the error when the replay succeeds', async () => {
    const first = await insertBillingAudit(db, {
      stripeEventId: 'evt_1',
      stripeEventType: 'invoice.payment_failed',
      stripeCustomerId: 'cus_1',
      email: 'Billing@Example.com',
      domainsLimit: 5,
      cancelAtPeriodEnd: true,
      eventCreatedAt: '2026-01-01T00:00:00Z',
      success: false,
      error: 'initial failure'
    })
    const replay = await insertBillingAudit(db, {
      stripeEventId: 'evt_1',
      stripeEventType: TYPE,
      status: 'active'
    })

    expect(replay).toEqual({
      ...first,
      stripe_event_type: TYPE,
      status: 'active',
      success: true,
      error: null,
      created_at: expect.any(String)
    })
    expect(await listBillingAudit(db)).toHaveLength(1)
    expect(await getLatestBillingAuditEvent(db, { success: false })).toBeNull()
  })

  it('adds a row for every event without an ID', async () => {
    await insertBillingAudit(db, { stripeEventType: TYPE })
    await insertBillingAudit(db, { stripeEventType: TYPE, stripeEventId: null })
    await insertBillingAudit(db, { stripeEventType: TYPE, stripeEventId: 'evt_1' })
    await insertBillingAudit(db, { stripeEventType: TYPE, stripeEventId: 'evt_2' })

    expect(await eventIds()).toEqual([null, null, 'evt_1', 'evt_2'])
  })

  it('reads the latest event, or the latest success or failure', async () => {
    expect(await getLatestBillingAuditEvent(db)).toBeNull()
    await insertRow('evt_old_fail', '2026-01-01T00:00:00.000Z', 0)
    await insertRow('evt_ok', '2026-02-01T00:00:00.000Z', 1)
    await insertRow('evt_null', '2026-03-01T00:00:00.000Z', null)

    expect(await getLatestBillingAuditEvent(db)).toMatchObject({
      stripe_event_id: 'evt_null',
      success: null
    })
    expect(await getLatestBillingAuditEvent(db, { success: true })).toMatchObject({
      stripe_event_id: 'evt_ok',
      success: true
    })
    expect(await getLatestBillingAuditEvent(db, { success: false })).toMatchObject({
      stripe_event_id: 'evt_old_fail',
      success: false
    })
    expect(await getLatestBillingAuditEvent(db, { success: null })).toMatchObject({
      stripe_event_id: 'evt_null'
    })
  })

  it('lists rows oldest first, ties by insertion order, filtered by outcome', async () => {
    await insertRow('evt_b', '2026-01-02T00:00:00.000Z')
    await insertRow('evt_tie_1', '2026-01-01T00:00:00.000Z', 0)
    await insertRow('evt_tie_2', '2026-01-01T00:00:00.000Z')

    expect(await eventIds()).toEqual(['evt_tie_1', 'evt_tie_2', 'evt_b'])
    expect((await listBillingAudit(db, { success: false })).map(r => r.stripe_event_id)).toEqual([
      'evt_tie_1'
    ])
    expect(
      (await listBillingAudit(db, { success: true, limit: 1, offset: 1 })).map(
        r => r.stripe_event_id
      )
    ).toEqual(['evt_b'])
    expect(await listBillingAudit(db, { limit: 0 })).toHaveLength(1)
    expect(await listBillingAudit(db, { offset: -3 })).toHaveLength(3)
    expect(await listBillingAudit(db, { offset: 1e9 })).toEqual([])
  })

  it('caps a page at 1000 rows', async () => {
    const statements = Array.from({ length: 1001 }, (_, index) =>
      d1
        .prepare('INSERT INTO dr_billing_audit (stripe_event_type, created_at) VALUES (?, ?)')
        .bind(TYPE, new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString())
    )
    await d1.batch(statements)

    expect(await listBillingAudit(db, { limit: 5000 })).toHaveLength(1000)
    expect(await listBillingAudit(db)).toHaveLength(500)
  }, 30_000)

  it('counts and prunes only rows older than the cutoff', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-01T00:00:00.000Z'), toFake: ['Date'] })

    expect(await countPrunableBillingAudit(db, { olderThanDays: 30 })).toEqual({
      count: 0,
      cutoff: new Date('2026-09-01T00:00:00.000Z')
    })
    expect(await pruneBillingAudit(db, { olderThanDays: 30 })).toEqual({
      removed: 0,
      cutoff: new Date('2026-09-01T00:00:00.000Z')
    })

    await insertRow('evt_old', '2026-08-31T23:59:59.999Z')
    await insertRow('evt_at_cutoff', '2026-09-01T00:00:00.000Z')
    await insertRow('evt_new', '2026-09-30T00:00:00.000Z')

    expect((await countPrunableBillingAudit(db, { olderThanDays: 30 })).count).toBe(1)
    expect(await eventIds()).toHaveLength(3)
    expect(await pruneBillingAudit(db, { olderThanDays: 30.9 })).toEqual({
      removed: 1,
      cutoff: new Date('2026-09-01T00:00:00.000Z')
    })
    expect(await eventIds()).toEqual(['evt_at_cutoff', 'evt_new'])
  })

  it('defaults the cutoff to 180 days and never to less than one', () => {
    vi.useFakeTimers({ now: new Date('2026-10-01T00:00:00.000Z'), toFake: ['Date'] })
    const now = Date.now()

    expect(billingAuditCutoff()).toEqual({ days: 180, cutoff: new Date(now - 180 * DAY) })
    expect(billingAuditCutoff({ olderThanDays: Number.NaN }).days).toBe(180)
    expect(billingAuditCutoff({ olderThanDays: 0 })).toEqual({
      days: 1,
      cutoff: new Date(now - DAY)
    })
    expect(billingAuditCutoff({ olderThanDays: 7.8 }).days).toBe(7)
  })
})
