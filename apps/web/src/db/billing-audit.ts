// The billing audit log: one row per Stripe webhook event the site handled, and whether handling
// succeeded. cancel_at_period_end and success read back as booleans or null.
import { asc, count, desc, eq, lt, sql } from 'drizzle-orm'

import { type Db, withDbErrors } from './client'
import { drBillingAudit } from './schema'
import { excluded, excludedOrStored } from './upsert'
import {
  fromD1Boolean,
  isFiniteNumber,
  isoText,
  normalizeEmail,
  nowIsoText,
  toD1Boolean
} from './values'

export type BillingAuditRow = {
  stripe_event_id: string | null
  stripe_event_type: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_price_id: string | null
  email: string | null
  billing_interval: string | null
  domains_limit: number | null
  status: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean | null
  event_created_at: string | null
  success: boolean | null
  error: string | null
  created_at: string
}

const BILLING_AUDIT_ROW = {
  stripe_event_id: drBillingAudit.stripeEventId,
  stripe_event_type: drBillingAudit.stripeEventType,
  stripe_customer_id: drBillingAudit.stripeCustomerId,
  stripe_subscription_id: drBillingAudit.stripeSubscriptionId,
  stripe_price_id: drBillingAudit.stripePriceId,
  email: drBillingAudit.email,
  billing_interval: drBillingAudit.billingInterval,
  domains_limit: drBillingAudit.domainsLimit,
  status: drBillingAudit.status,
  current_period_end: drBillingAudit.currentPeriodEnd,
  cancel_at_period_end: drBillingAudit.cancelAtPeriodEnd,
  event_created_at: drBillingAudit.eventCreatedAt,
  success: drBillingAudit.success,
  error: drBillingAudit.error,
  created_at: drBillingAudit.createdAt
}

function billingAuditRow(
  row: Omit<BillingAuditRow, 'cancel_at_period_end' | 'success'> & {
    cancel_at_period_end: number | null
    success: number | null
  }
): BillingAuditRow {
  return {
    ...row,
    cancel_at_period_end: fromD1Boolean(row.cancel_at_period_end),
    success: fromD1Boolean(row.success)
  }
}

// Logs a webhook event. A replay of an event (same stripe_event_id) updates its row instead of
// adding one: the latest attempt's type, outcome, error and time win, and other fields it leaves
// NULL keep their stored values. Events without an ID always add a row; the unique index on
// stripe_event_id is partial, so NULLs never conflict.
export const insertBillingAudit = withDbErrors(async function insertBillingAudit(
  db: Db,
  input: {
    stripeEventId?: string | null
    stripeEventType: string
    stripeCustomerId?: string | null
    stripeSubscriptionId?: string | null
    stripePriceId?: string | null
    email?: string | null
    billingInterval?: string | null
    domainsLimit?: number | null
    status?: string | null
    currentPeriodEnd?: Date | string | null
    cancelAtPeriodEnd?: boolean | null
    eventCreatedAt?: Date | string | null
    success?: boolean | null
    error?: string | null
  }
): Promise<BillingAuditRow | null> {
  if (!input.stripeEventType) return null
  const [row] = await db
    .insert(drBillingAudit)
    .values({
      stripeEventId: input.stripeEventId ?? null,
      stripeEventType: input.stripeEventType,
      stripeCustomerId: input.stripeCustomerId ?? null,
      stripeSubscriptionId: input.stripeSubscriptionId ?? null,
      stripePriceId: input.stripePriceId ?? null,
      email: input.email ? normalizeEmail(input.email) : null,
      billingInterval: input.billingInterval ?? null,
      domainsLimit: input.domainsLimit ?? null,
      status: input.status ?? null,
      currentPeriodEnd: isoText(input.currentPeriodEnd),
      // NULL, not the column's default of 0, when the event doesn't say.
      cancelAtPeriodEnd: toD1Boolean(input.cancelAtPeriodEnd),
      eventCreatedAt: isoText(input.eventCreatedAt),
      // Success unless the caller says otherwise.
      success: typeof input.success === 'boolean' ? toD1Boolean(input.success) : 1,
      error: input.error ?? null,
      createdAt: nowIsoText()
    })
    .onConflictDoUpdate({
      target: drBillingAudit.stripeEventId,
      // Names the partial unique index (stripe_event_id IS NOT NULL) as the conflict target.
      targetWhere: sql`stripe_event_id IS NOT NULL`,
      set: {
        stripeEventType: excluded(drBillingAudit.stripeEventType),
        stripeCustomerId: excludedOrStored(drBillingAudit.stripeCustomerId),
        stripeSubscriptionId: excludedOrStored(drBillingAudit.stripeSubscriptionId),
        stripePriceId: excludedOrStored(drBillingAudit.stripePriceId),
        email: excludedOrStored(drBillingAudit.email),
        billingInterval: excludedOrStored(drBillingAudit.billingInterval),
        domainsLimit: excludedOrStored(drBillingAudit.domainsLimit),
        status: excludedOrStored(drBillingAudit.status),
        currentPeriodEnd: excludedOrStored(drBillingAudit.currentPeriodEnd),
        cancelAtPeriodEnd: excludedOrStored(drBillingAudit.cancelAtPeriodEnd),
        eventCreatedAt: excludedOrStored(drBillingAudit.eventCreatedAt),
        success: excludedOrStored(drBillingAudit.success),
        // A replay that succeeds clears the earlier failure's error.
        error: excluded(drBillingAudit.error),
        createdAt: excluded(drBillingAudit.createdAt)
      }
    })
    .returning(BILLING_AUDIT_ROW)
  return row ? billingAuditRow(row) : null
})

function successFilter(success: unknown) {
  return typeof success === 'boolean' ? eq(drBillingAudit.success, success ? 1 : 0) : undefined
}

// The most recent event, or the most recent success or failure (the webhook health check).
export const getLatestBillingAuditEvent = withDbErrors(async function getLatestBillingAuditEvent(
  db: Db,
  opts: { success?: boolean | null } = {}
): Promise<BillingAuditRow | null> {
  const [row] = await db
    .select(BILLING_AUDIT_ROW)
    .from(drBillingAudit)
    .where(successFilter(opts.success))
    .orderBy(desc(drBillingAudit.createdAt))
    .limit(1)
  return row ? billingAuditRow(row) : null
})

// Audit rows, oldest first, a page at a time (export tooling).
export const listBillingAudit = withDbErrors(async function listBillingAudit(
  db: Db,
  opts: { success?: boolean | null; limit?: number; offset?: number } = {}
): Promise<BillingAuditRow[]> {
  const limit = isFiniteNumber(opts.limit) ? Math.max(1, Math.min(1000, opts.limit)) : 500
  const offset = isFiniteNumber(opts.offset) ? Math.max(0, opts.offset) : 0
  const rows = await db
    .select(BILLING_AUDIT_ROW)
    .from(drBillingAudit)
    .where(successFilter(opts.success))
    .orderBy(asc(drBillingAudit.createdAt), asc(drBillingAudit.id))
    .limit(limit)
    .offset(offset)
  return rows.map(billingAuditRow)
})

// Rows logged before this time are prunable: olderThanDays (whole days, at least 1, default 180)
// before now.
export function billingAuditCutoff(opts: { olderThanDays?: number } = {}) {
  const days = isFiniteNumber(opts.olderThanDays)
    ? Math.max(1, Math.floor(opts.olderThanDays))
    : 180
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return { days, cutoff }
}

export const countPrunableBillingAudit = withDbErrors(async function countPrunableBillingAudit(
  db: Db,
  opts: { olderThanDays?: number } = {}
) {
  const { cutoff } = billingAuditCutoff(opts)
  const [row] = await db
    .select({ count: count() })
    .from(drBillingAudit)
    .where(lt(drBillingAudit.createdAt, cutoff.toISOString()))
  return { count: row?.count ?? 0, cutoff }
})

export const pruneBillingAudit = withDbErrors(async function pruneBillingAudit(
  db: Db,
  opts: { olderThanDays?: number } = {}
) {
  const { cutoff } = billingAuditCutoff(opts)
  const result = await db
    .delete(drBillingAudit)
    .where(lt(drBillingAudit.createdAt, cutoff.toISOString()))
    .run()
  return { removed: Number(result.meta?.changes ?? 0), cutoff }
})
