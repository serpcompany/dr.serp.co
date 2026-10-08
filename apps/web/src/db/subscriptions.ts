// Stripe subscriptions, one row per subscription, kept in step by the webhook. Emails are stored
// trimmed and lowercased; cancel_at_period_end reads back as a boolean or null.
import { and, desc, eq, gt, inArray, isNull, or } from 'drizzle-orm'

import { type Db, withDbErrors } from './client'
import { drSubscriptions } from './schema'
import { excluded, excludedOrStored } from './upsert'
import {
  fromD1Boolean,
  isFiniteNumber,
  isoText,
  normalizeEmail,
  nowIsoText,
  toD1Boolean
} from './values'

export type SubscriptionRow = {
  email: string
  stripe_customer_id: string | null
  stripe_subscription_id: string
  stripe_price_id: string | null
  billing_interval: string | null
  domains_limit: number | null
  status: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean | null
  created_at: string
  updated_at: string
}

const SUBSCRIPTION_ROW = {
  email: drSubscriptions.email,
  stripe_customer_id: drSubscriptions.stripeCustomerId,
  stripe_subscription_id: drSubscriptions.stripeSubscriptionId,
  stripe_price_id: drSubscriptions.stripePriceId,
  billing_interval: drSubscriptions.billingInterval,
  domains_limit: drSubscriptions.domainsLimit,
  status: drSubscriptions.status,
  current_period_end: drSubscriptions.currentPeriodEnd,
  cancel_at_period_end: drSubscriptions.cancelAtPeriodEnd,
  created_at: drSubscriptions.createdAt,
  updated_at: drSubscriptions.updatedAt
}

function subscriptionRow(
  row: Omit<SubscriptionRow, 'cancel_at_period_end'> & { cancel_at_period_end: number | null }
): SubscriptionRow {
  return { ...row, cancel_at_period_end: fromD1Boolean(row.cancel_at_period_end) }
}

// Keyed by the Stripe subscription ID. A field the event leaves NULL keeps the stored value, so a
// sparse event never erases what an earlier one recorded.
export const upsertSubscription = withDbErrors(async function upsertSubscription(
  db: Db,
  input: {
    email: unknown
    stripeCustomerId?: string | null
    stripeSubscriptionId: unknown
    stripePriceId?: string | null
    billingInterval?: string | null
    domainsLimit?: number | null
    status?: string | null
    currentPeriodEnd?: Date | string | null
    cancelAtPeriodEnd?: boolean | null
  }
): Promise<SubscriptionRow | null> {
  const email = normalizeEmail(input.email)
  const subscriptionId = String(input.stripeSubscriptionId ?? '').trim()
  if (!email || !subscriptionId) return null
  const [row] = await db
    .insert(drSubscriptions)
    .values({
      email,
      stripeCustomerId: input.stripeCustomerId ?? null,
      stripeSubscriptionId: subscriptionId,
      stripePriceId: input.stripePriceId ?? null,
      billingInterval: input.billingInterval ?? null,
      domainsLimit: input.domainsLimit ?? null,
      status: input.status ?? null,
      currentPeriodEnd: isoText(input.currentPeriodEnd),
      // NULL, not the column's default of 0, when the event doesn't say.
      cancelAtPeriodEnd: toD1Boolean(input.cancelAtPeriodEnd),
      updatedAt: nowIsoText()
    })
    .onConflictDoUpdate({
      target: drSubscriptions.stripeSubscriptionId,
      set: {
        email: excludedOrStored(drSubscriptions.email),
        stripeCustomerId: excludedOrStored(drSubscriptions.stripeCustomerId),
        stripePriceId: excludedOrStored(drSubscriptions.stripePriceId),
        billingInterval: excludedOrStored(drSubscriptions.billingInterval),
        domainsLimit: excludedOrStored(drSubscriptions.domainsLimit),
        status: excludedOrStored(drSubscriptions.status),
        currentPeriodEnd: excludedOrStored(drSubscriptions.currentPeriodEnd),
        cancelAtPeriodEnd: excludedOrStored(drSubscriptions.cancelAtPeriodEnd),
        updatedAt: excluded(drSubscriptions.updatedAt)
      }
    })
    .returning(SUBSCRIPTION_ROW)
  return row ? subscriptionRow(row) : null
})

// The most recently updated subscription that is active or trialing and not past its period end
// (a NULL period end counts as current).
export const getActiveSubscriptionByEmail = withDbErrors(
  async function getActiveSubscriptionByEmail(
    db: Db,
    email: unknown
  ): Promise<SubscriptionRow | null> {
    const normalized = normalizeEmail(email)
    if (!normalized) return null
    const [row] = await db
      .select(SUBSCRIPTION_ROW)
      .from(drSubscriptions)
      .where(
        and(
          eq(drSubscriptions.email, normalized),
          inArray(drSubscriptions.status, ['active', 'trialing']),
          or(
            isNull(drSubscriptions.currentPeriodEnd),
            gt(drSubscriptions.currentPeriodEnd, nowIsoText())
          )
        )
      )
      .orderBy(desc(drSubscriptions.updatedAt))
      .limit(1)
    return row ? subscriptionRow(row) : null
  }
)

// The most recently updated subscription, whatever its status.
export const getLatestSubscriptionByEmail = withDbErrors(
  async function getLatestSubscriptionByEmail(
    db: Db,
    email: unknown
  ): Promise<SubscriptionRow | null> {
    const normalized = normalizeEmail(email)
    if (!normalized) return null
    const [row] = await db
      .select(SUBSCRIPTION_ROW)
      .from(drSubscriptions)
      .where(eq(drSubscriptions.email, normalized))
      .orderBy(desc(drSubscriptions.updatedAt))
      .limit(1)
    return row ? subscriptionRow(row) : null
  }
)

// Subscriptions, most recently updated first, a page at a time (reporting).
export const listSubscriptions = withDbErrors(async function listSubscriptions(
  db: Db,
  opts: { email?: unknown; limit?: number; offset?: number } = {}
): Promise<SubscriptionRow[]> {
  const email = opts.email ? normalizeEmail(opts.email) : null
  const limit = isFiniteNumber(opts.limit) ? Math.max(1, Math.min(200, opts.limit)) : 100
  const offset = isFiniteNumber(opts.offset) ? Math.max(0, opts.offset) : 0
  const rows = await db
    .select(SUBSCRIPTION_ROW)
    .from(drSubscriptions)
    .where(email === null ? undefined : eq(drSubscriptions.email, email))
    .orderBy(desc(drSubscriptions.updatedAt))
    .limit(limit)
    .offset(offset)
  return rows.map(subscriptionRow)
})
