import Stripe from 'stripe'

import { callAdminApi, hasAdminApi, loadAdminEnv } from './_admin-api.mjs'

const adminEnv = loadAdminEnv()
const stripeKey = process.env.STRIPE_SECRET_KEY

if (!stripeKey) {
  console.error('Missing STRIPE_SECRET_KEY.')
  process.exit(1)
}

const stripe = new Stripe(stripeKey)

function loadAppPriceIds() {
  if (!process.env.STRIPE_PRICE_IDS) return null
  try {
    const config = JSON.parse(process.env.STRIPE_PRICE_IDS)
    const priceIds = new Set()
    for (const group of [config.monthly, config.annual]) {
      for (const value of Object.values(group ?? {})) {
        if (typeof value === 'string' && value) priceIds.add(value)
      }
    }
    return priceIds.size ? priceIds : null
  } catch {
    return null
  }
}

const appPriceIds = loadAppPriceIds()

function subscriptionPriceId(subscription) {
  return subscription.items?.data?.[0]?.price?.id ?? null
}

async function loadAllDbSubscriptions() {
  if (hasAdminApi(adminEnv)) {
    const payload = await callAdminApi('/api/admin/subscriptions', {
      method: 'GET',
      env: adminEnv
    })
    return (payload.report ?? []).map(row => ({
      email: row.email,
      stripe_subscription_id: row.stripeSubscriptionId,
      stripe_customer_id: row.stripeCustomerId,
      stripe_price_id: row.stripePriceId,
      billing_interval: row.billingInterval,
      domains_limit: row.domainsLimit,
      status: row.status,
      current_period_end: row.currentPeriodEnd,
      cancel_at_period_end: row.cancelAtPeriodEnd,
      updated_at: row.updatedAt
    }))
  }

  const rows = []
  const { listSubscriptions } = await import('../src/server/db.mjs')
  let offset = 0
  while (true) {
    const batch = await listSubscriptions({ limit: 200, offset })
    if (!batch.length) break
    rows.push(...batch)
    offset += batch.length
  }
  return rows
}

async function loadAllStripeSubscriptions() {
  const rows = []
  let startingAfter
  while (true) {
    const page = await stripe.subscriptions.list({ limit: 100, starting_after: startingAfter })
    rows.push(
      ...page.data.filter(subscription => {
        if (!appPriceIds) return true
        const priceId = subscriptionPriceId(subscription)
        return priceId ? appPriceIds.has(priceId) : false
      })
    )
    if (!page.has_more) break
    startingAfter = page.data[page.data.length - 1]?.id
  }
  return rows
}

function toUnixSeconds(value) {
  if (!value) return null
  if (value instanceof Date) return Math.floor(value.getTime() / 1000)
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? Math.floor(parsed.getTime() / 1000) : null
}

const dbSubs = await loadAllDbSubscriptions()
const stripeSubs = await loadAllStripeSubscriptions()

const dbById = new Map(dbSubs.map(row => [row.stripe_subscription_id, row]))
const stripeById = new Map(stripeSubs.map(row => [row.id, row]))

const missingInDb = stripeSubs.filter(sub => !dbById.has(sub.id))
const missingInStripe = dbSubs.filter(
  sub => sub.stripe_subscription_id && !stripeById.has(sub.stripe_subscription_id)
)

const mismatched = []
for (const stripeSub of stripeSubs) {
  const db = dbById.get(stripeSub.id)
  if (!db) continue
  const priceId = subscriptionPriceId(stripeSub)
  const currentPeriodEnd = stripeSub.current_period_end ?? null
  const dbPeriodEnd = toUnixSeconds(db.current_period_end)

  if (
    (db.status && db.status !== stripeSub.status) ||
    (db.stripe_price_id && db.stripe_price_id !== priceId) ||
    (dbPeriodEnd && currentPeriodEnd && dbPeriodEnd !== currentPeriodEnd)
  ) {
    mismatched.push({
      stripe_subscription_id: stripeSub.id,
      stripe_status: stripeSub.status,
      db_status: db.status,
      stripe_price_id: priceId,
      db_price_id: db.stripe_price_id,
      stripe_current_period_end: currentPeriodEnd,
      db_current_period_end: dbPeriodEnd
    })
  }
}

console.log('Stripe subscription reconciliation')
console.log(`Stripe subscriptions: ${stripeSubs.length}`)
console.log(`DB subscriptions: ${dbSubs.length}`)
console.log(`Missing in DB: ${missingInDb.length}`)
console.log(`Missing in Stripe: ${missingInStripe.length}`)
console.log(`Mismatched records: ${mismatched.length}`)

if (missingInDb.length) {
  console.log('\nMissing in DB (Stripe subscription IDs):')
  console.log(missingInDb.map(sub => sub.id))
}

if (missingInStripe.length) {
  console.log('\nMissing in Stripe (DB subscription IDs):')
  console.log(missingInStripe.map(sub => sub.stripe_subscription_id))
}

if (mismatched.length) {
  console.log('\nMismatched records:')
  console.log(mismatched)
}
