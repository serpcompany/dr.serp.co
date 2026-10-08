import Stripe from "stripe"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { getStripe } from "@/lib/stripe"
import { getTierForPriceId } from "@/lib/stripe-pricing"
import {
  getLatestBillingAuditEvent,
  getLatestBillingAuditFailure,
  insertBillingAudit,
  upsertSubscription,
} from "@/server/db.mjs"
import { checkRateLimit, getRateLimitKey } from "@/server/rate-limit.mjs"

export const runtime = "nodejs"

const RATE_LIMIT_POINTS = Number(process.env.STRIPE_WEBHOOK_RATE_LIMIT_POINTS ?? 120)
const RATE_LIMIT_DURATION = Number(process.env.STRIPE_WEBHOOK_RATE_LIMIT_DURATION ?? 60)
const HEALTH_STALE_HOURS = Number(process.env.STRIPE_WEBHOOK_STALE_HOURS ?? 24)
const HEALTH_FAILURE_WINDOW_MINUTES = Number(process.env.STRIPE_WEBHOOK_FAILURE_WINDOW_MINUTES ?? 60)

function normalizeEmail(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase()
}

function billingFromInterval(interval: string | null | undefined) {
  if (!interval) return null
  return interval === "year" ? "annual" : "monthly"
}

function toDate(value: Date | string | null | undefined) {
  if (!value) return null
  if (value instanceof Date) return value
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

// Webhook payloads follow the endpoint's API version (2025-06-30.basil), not the SDK's
// (2023-10-16), so read fields that basil moved from either place.
type InvoiceShapes = {
  subscription?: string | null
  parent?: { subscription_details?: { subscription?: string | null } | null } | null
}
type PeriodEnd = { current_period_end?: number | null }

function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  const shapes = invoice as unknown as InvoiceShapes
  const value = shapes.subscription ?? shapes.parent?.subscription_details?.subscription
  return typeof value === "string" ? value : null
}

function subscriptionPeriodEnd(subscription: Stripe.Subscription) {
  const legacy = (subscription as unknown as PeriodEnd).current_period_end
  const basil = (subscription.items?.data?.[0] as unknown as PeriodEnd | undefined)?.current_period_end
  const seconds = legacy ?? basil ?? null
  return seconds ? new Date(seconds * 1000) : null
}

async function resolveCustomerEmail(stripe: Stripe, customerId?: string | null) {
  if (!customerId) return null
  const customer = await stripe.customers.retrieve(customerId)
  if (customer && !("deleted" in customer)) {
    return customer.email ?? null
  }
  return null
}

async function buildSubscriptionSnapshot(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  emailOverride?: string | null
) {
  const price = subscription.items.data[0]?.price
  const priceId = price?.id ?? null
  // Null for another product's price. A broken STRIPE_PRICE_IDS throws instead, so the event fails
  // with a 500 and Stripe retries it, rather than being ignored as another product's.
  const tier = priceId ? getTierForPriceId(priceId) : null
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id

  const emailFromCustomer = await resolveCustomerEmail(stripe, customerId)
  const email = normalizeEmail(emailOverride ?? emailFromCustomer)

  const billingInterval = tier?.billing ?? billingFromInterval(price?.recurring?.interval ?? null)
  const domainsLimit = tier?.domains ?? null
  const currentPeriodEnd = subscriptionPeriodEnd(subscription)

  return {
    email: email || null,
    stripeCustomerId: customerId ?? null,
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId,
    billingInterval,
    domainsLimit,
    status: subscription.status,
    currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? null,
    // The Stripe account also sells other SERP products; only dr.serp.co's prices map to a tier.
    isDrPlan: tier !== null,
  }
}

const IGNORED_PRICE = "Ignored: not a dr.serp.co price."

async function syncSubscription(snapshot: Awaited<ReturnType<typeof buildSubscriptionSnapshot>>) {
  if (!snapshot.isDrPlan) {
    console.info("stripe.webhook: ignored a subscription on another product", snapshot.stripePriceId)
    return { record: null, snapshot, ignored: true }
  }
  if (!snapshot.email) {
    console.warn("stripe.webhook: missing email for subscription", snapshot.stripeSubscriptionId)
    return { record: null, snapshot, ignored: false }
  }

  const record = await upsertSubscription({
    email: snapshot.email,
    stripeCustomerId: snapshot.stripeCustomerId ?? null,
    stripeSubscriptionId: snapshot.stripeSubscriptionId,
    stripePriceId: snapshot.stripePriceId ?? null,
    billingInterval: snapshot.billingInterval ?? null,
    domainsLimit: snapshot.domainsLimit ?? null,
    status: snapshot.status ?? null,
    currentPeriodEnd: snapshot.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd ?? null,
  })

  return { record, snapshot, ignored: false }
}

// The audit row for a synced event. Another product's event keeps only its ids and price, not
// that customer's email or plan.
function auditFields(synced: Awaited<ReturnType<typeof syncSubscription>>) {
  const { snapshot } = synced
  if (synced.ignored) {
    return {
      stripeSubscriptionId: snapshot.stripeSubscriptionId ?? null,
      stripePriceId: snapshot.stripePriceId ?? null,
      success: true,
      error: IGNORED_PRICE,
    }
  }
  return {
    stripeCustomerId: snapshot.stripeCustomerId ?? null,
    stripeSubscriptionId: snapshot.stripeSubscriptionId ?? null,
    stripePriceId: snapshot.stripePriceId ?? null,
    email: snapshot.email ?? null,
    billingInterval: snapshot.billingInterval ?? null,
    domainsLimit: snapshot.domainsLimit ?? null,
    status: snapshot.status ?? null,
    currentPeriodEnd: snapshot.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd ?? null,
    success: true,
  }
}

export async function POST(request: Request) {
  const rateKey = getRateLimitKey(request, "stripe-webhook")
  const rate = await checkRateLimit({ key: rateKey, points: RATE_LIMIT_POINTS, duration: RATE_LIMIT_DURATION })
  if (!rate.allowed) {
    const retryAfter = Math.ceil(rate.retryAfterMs / 1000)
    return NextResponse.json(
      { error: "Too many webhook requests." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    )
  }

  const stripe = getStripe()
  const headersList = await headers()
  const signature = headersList.get("stripe-signature")
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook not configured." }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    const body = Buffer.from(await request.arrayBuffer())
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (error) {
    // The request isn't verified yet, so the caller gets no detail; the log keeps it.
    const message = error instanceof Error ? error.message : "Invalid signature."
    console.error("stripe.webhook: signature verification failed", message)
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 })
  }

  const eventCreatedAt = event.created ? new Date(event.created * 1000) : null

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : null
        const email = session.customer_details?.email ?? session.customer_email ?? null
        if (!subscriptionId) {
          console.warn("stripe.webhook: checkout session missing subscription", session.id)
          await insertBillingAudit({
            stripeEventId: event.id,
            stripeEventType: event.type,
            eventCreatedAt,
            success: false,
            error: "checkout session missing subscription",
          })
          break
        }
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        const snapshot = await buildSubscriptionSnapshot(stripe, subscription, email)
        const synced = await syncSubscription(snapshot)
        await insertBillingAudit({
          stripeEventId: event.id,
          stripeEventType: event.type,
          eventCreatedAt,
          ...auditFields(synced),
        })
        break
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription
        const snapshot = await buildSubscriptionSnapshot(stripe, subscription, null)
        const synced = await syncSubscription(snapshot)
        await insertBillingAudit({
          stripeEventId: event.id,
          stripeEventType: event.type,
          eventCreatedAt,
          ...auditFields(synced),
        })
        break
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = invoiceSubscriptionId(invoice)
        if (!subscriptionId) {
          await insertBillingAudit({
            stripeEventId: event.id,
            stripeEventType: event.type,
            eventCreatedAt,
            success: false,
            error: "invoice missing subscription",
          })
          break
        }
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        const snapshot = await buildSubscriptionSnapshot(stripe, subscription, null)
        const synced = await syncSubscription(snapshot)
        await insertBillingAudit({
          stripeEventId: event.id,
          stripeEventType: event.type,
          eventCreatedAt,
          ...auditFields(synced),
        })
        break
      }
      default: {
        await insertBillingAudit({
          stripeEventId: event.id,
          stripeEventType: event.type,
          eventCreatedAt,
          success: true,
        })
        break
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook handler failed."
    console.error("stripe.webhook: handler error", message)
    await insertBillingAudit({
      stripeEventId: event?.id ?? null,
      stripeEventType: event?.type ?? "unknown",
      eventCreatedAt,
      success: false,
      error: message,
    })
    // The audit row keeps the message; the 500 makes Stripe retry.
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

export async function GET() {
  const [latest, latestFailure] = await Promise.all([
    getLatestBillingAuditEvent(),
    getLatestBillingAuditFailure(),
  ])

  const now = new Date()
  const lastEventAt = toDate(latest?.created_at ?? null)
  const lastFailureAt = toDate(latestFailure?.created_at ?? null)

  let status = "ok"
  if (!lastEventAt) {
    status = "missing"
  } else if (now.getTime() - lastEventAt.getTime() > HEALTH_STALE_HOURS * 60 * 60 * 1000) {
    status = "stale"
  } else if (
    lastFailureAt &&
    now.getTime() - lastFailureAt.getTime() < HEALTH_FAILURE_WINDOW_MINUTES * 60 * 1000
  ) {
    status = "degraded"
  }

  return NextResponse.json({
    ok: status === "ok",
    status,
    lastEventAt: lastEventAt ? lastEventAt.toISOString() : null,
    lastFailureAt: lastFailureAt ? lastFailureAt.toISOString() : null,
  })
}
