// The D1 schema, as Drizzle tables. Every column, CHECK and index matches Production
// (drizzle/0001_initial_d1_schema.sql, which also makes each table STRICT: Drizzle can't express
// that). Timestamps are ISO-8601 UTC text; booleans are INTEGER 0 or 1. Change the schema only
// through a migration from `pnpm db:generate`.
import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const isoNow = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`

// A claimed (or looked-up) site: its latest DR, metadata and owner.
export const drClaims = sqliteTable(
  'dr_claims',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    domain: text('domain').notNull(),
    email: text('email'),
    domainRating: integer('domain_rating'),
    provider: text('provider'),
    siteTitle: text('site_title'),
    metaDescription: text('meta_description'),
    siteUrl: text('site_url'),
    screenshotUrl: text('screenshot_url'),
    claimedAt: text('claimed_at').notNull().default(isoNow),
    updatedAt: text('updated_at').notNull().default(isoNow)
  },
  table => [
    check(
      'dr_claims_domain_rating_range',
      sql`${table.domainRating} IS NULL OR (${table.domainRating} >= 0 AND ${table.domainRating} <= 100)`
    ),
    uniqueIndex('dr_claims_domain_uq').on(table.domain),
    index('dr_claims_email_idx').on(table.email),
    index('dr_claims_updated_idx').on(sql`${table.updatedAt} desc`),
    index('dr_claims_domain_rating_updated_idx').on(
      sql`${table.domainRating} desc`,
      sql`${table.updatedAt} desc`
    )
  ]
)

// One DR lookup result per row, for history charts and recheck cadence.
export const drChecks = sqliteTable(
  'dr_checks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    domain: text('domain').notNull(),
    domainRating: integer('domain_rating').notNull(),
    provider: text('provider'),
    checkedAt: text('checked_at').notNull().default(isoNow)
  },
  table => [
    check(
      'dr_checks_domain_rating_range',
      sql`${table.domainRating} >= 0 AND ${table.domainRating} <= 100`
    ),
    index('dr_checks_domain_checked_at_idx').on(table.domain, sql`${table.checkedAt} desc`),
    index('dr_checks_checked_at_idx').on(sql`${table.checkedAt} desc`)
  ]
)

// A Stripe subscription, synced from webhooks.
export const drSubscriptions = sqliteTable(
  'dr_subscriptions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').notNull(),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id').notNull(),
    stripePriceId: text('stripe_price_id'),
    billingInterval: text('billing_interval'),
    domainsLimit: integer('domains_limit'),
    status: text('status'),
    currentPeriodEnd: text('current_period_end'),
    cancelAtPeriodEnd: integer('cancel_at_period_end').default(0),
    createdAt: text('created_at').notNull().default(isoNow),
    updatedAt: text('updated_at').notNull().default(isoNow)
  },
  table => [
    check(
      'dr_subscriptions_domains_limit_min',
      sql`${table.domainsLimit} IS NULL OR ${table.domainsLimit} >= 0`
    ),
    check(
      'dr_subscriptions_cancel_at_period_end_bool',
      sql`${table.cancelAtPeriodEnd} IS NULL OR ${table.cancelAtPeriodEnd} IN (0, 1)`
    ),
    uniqueIndex('dr_subscriptions_stripe_subscription_id_uq').on(table.stripeSubscriptionId),
    index('dr_subscriptions_email_idx').on(table.email),
    index('dr_subscriptions_customer_idx').on(table.stripeCustomerId),
    index('dr_subscriptions_email_updated_idx').on(table.email, sql`${table.updatedAt} desc`)
  ]
)

// Every Stripe webhook event the site processed, and whether it succeeded.
export const drBillingAudit = sqliteTable(
  'dr_billing_audit',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    stripeEventId: text('stripe_event_id'),
    stripeEventType: text('stripe_event_type').notNull(),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    stripePriceId: text('stripe_price_id'),
    email: text('email'),
    billingInterval: text('billing_interval'),
    domainsLimit: integer('domains_limit'),
    status: text('status'),
    currentPeriodEnd: text('current_period_end'),
    cancelAtPeriodEnd: integer('cancel_at_period_end').default(0),
    eventCreatedAt: text('event_created_at'),
    success: integer('success').default(1),
    error: text('error'),
    createdAt: text('created_at').notNull().default(isoNow)
  },
  table => [
    check(
      'dr_billing_audit_domains_limit_min',
      sql`${table.domainsLimit} IS NULL OR ${table.domainsLimit} >= 0`
    ),
    check(
      'dr_billing_audit_cancel_at_period_end_bool',
      sql`${table.cancelAtPeriodEnd} IS NULL OR ${table.cancelAtPeriodEnd} IN (0, 1)`
    ),
    check(
      'dr_billing_audit_success_bool',
      sql`${table.success} IS NULL OR ${table.success} IN (0, 1)`
    ),
    uniqueIndex('dr_billing_audit_stripe_event_id_uq')
      .on(table.stripeEventId)
      .where(sql`${table.stripeEventId} IS NOT NULL`),
    index('dr_billing_audit_created_idx').on(sql`${table.createdAt} desc`),
    index('dr_billing_audit_email_idx').on(table.email),
    index('dr_billing_audit_subscription_idx').on(table.stripeSubscriptionId)
  ]
)
