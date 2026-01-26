import Stripe from "stripe"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { getStripe } from "@/lib/stripe"
import { getTierForPriceId } from "@/lib/stripe-pricing"
import { upsertSubscription } from "@/server/db.mjs"

export const runtime = "nodejs"

function normalizeEmail(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase()
}

function billingFromInterval(interval: string | null | undefined) {
  if (!interval) return null
  return interval === "year" ? "annual" : "monthly"
}

async function resolveCustomerEmail(stripe: Stripe, customerId?: string | null) {
  if (!customerId) return null
  const customer = await stripe.customers.retrieve(customerId)
  if (customer && !("deleted" in customer)) {
    return customer.email ?? null
  }
  return null
}

async function syncSubscription(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  emailOverride?: string | null
) {
  const price = subscription.items.data[0]?.price
  const priceId = price?.id ?? null
  const tier = priceId ? getTierForPriceId(priceId) : null
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id

  const emailFromCustomer = await resolveCustomerEmail(stripe, customerId)
  const email = normalizeEmail(emailOverride ?? emailFromCustomer)

  if (!email) {
    console.warn("stripe.webhook: missing email for subscription", subscription.id)
    return null
  }

  const billingInterval = tier?.billing ?? billingFromInterval(price?.recurring?.interval ?? null)
  const domainsLimit = tier?.domains ?? null
  const currentPeriodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null

  return upsertSubscription({
    email,
    stripeCustomerId: customerId ?? null,
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId,
    billingInterval,
    domainsLimit,
    status: subscription.status,
    currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? null,
  })
}

export async function POST(request: Request) {
  const stripe = getStripe()
  const signature = headers().get("stripe-signature")
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook not configured." }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    const body = Buffer.from(await request.arrayBuffer())
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid signature."
    console.error("stripe.webhook: signature verification failed", message)
    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : null
        const email = session.customer_details?.email ?? session.customer_email ?? null
        if (!subscriptionId) {
          console.warn("stripe.webhook: checkout session missing subscription", session.id)
          break
        }
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        await syncSubscription(stripe, subscription, email)
        break
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription
        await syncSubscription(stripe, subscription, null)
        break
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : null
        if (!subscriptionId) break
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        await syncSubscription(stripe, subscription, null)
        break
      }
      default:
        break
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook handler failed."
    console.error("stripe.webhook: handler error", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
