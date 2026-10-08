import { NextResponse } from "next/server"

import type { BillingPeriod } from "@/lib/pricing"
import { getStripe } from "@/lib/stripe"
import { getPriceId, getTierForPriceId } from "@/lib/stripe-pricing"
import { getSessionEmail } from "@/server/auth-session.mjs"
import { resolveEntitlement } from "@/server/entitlements.mjs"
import { RATE_LIMITER_UNAVAILABLE_MESSAGE, checkRateLimit, getRateLimitKey } from "@/server/rate-limit.mjs"
import { readWriteRequest } from "@/server/write-route"
import { CheckoutBody } from "@/server/write-schemas"

export const runtime = "nodejs"

const ALLOWED_DOMAINS = [12, 25, 50, 100] as const
const RATE_LIMIT_POINTS = Number(process.env.CHANGE_PLAN_RATE_LIMIT_POINTS ?? 10)
const RATE_LIMIT_DURATION = Number(process.env.CHANGE_PLAN_RATE_LIMIT_DURATION ?? 60)

// Moves a subscriber's existing subscription to another size or billing interval. Stripe's portal
// can't do it (one price per interval for each product), and a second checkout would bill twice.
// The difference is prorated and invoiced at once; the webhook then syncs the new plan.
export async function POST(request: Request) {
  const read = await readWriteRequest(request, CheckoutBody)
  if (!read.ok) return read.response

  const email = getSessionEmail(request)
  if (!email) {
    return NextResponse.json({ error: "Sign in required.", code: "auth_required" }, { status: 401 })
  }

  const rate = await checkRateLimit({
    key: getRateLimitKey(request, "stripe-change-plan"),
    points: RATE_LIMIT_POINTS,
    duration: RATE_LIMIT_DURATION,
  })
  if (rate.unavailable) {
    return NextResponse.json({ error: RATE_LIMITER_UNAVAILABLE_MESSAGE }, { status: 503 })
  }
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many plan changes. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } }
    )
  }

  const { domains } = read.data
  const billing = read.data.billing as BillingPeriod
  if (!ALLOWED_DOMAINS.includes(domains as (typeof ALLOWED_DOMAINS)[number])) {
    return NextResponse.json({ error: "Invalid domain tier." }, { status: 400 })
  }
  if (billing !== "monthly" && billing !== "annual") {
    return NextResponse.json({ error: "Invalid billing period." }, { status: 400 })
  }

  const entitlement = await resolveEntitlement({ email })
  const subscriptionId = entitlement?.subscription?.stripeSubscriptionId
  if (!entitlement?.canAccessPaidFeatures || !subscriptionId) {
    return NextResponse.json({ error: "You don't have a plan to change yet.", code: "no_plan" }, { status: 409 })
  }

  try {
    const stripe = getStripe()
    const priceId = getPriceId(domains, billing)
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    const item = subscription.items.data[0]
    // Only ever move a dr.serp.co subscription; the Stripe account also sells other products.
    if (!item?.price?.id || !getTierForPriceId(item.price.id)) {
      return NextResponse.json({ error: "You don't have a plan to change yet.", code: "no_plan" }, { status: 409 })
    }
    if (item.price.id === priceId) {
      return NextResponse.json({ error: "You're already on this plan.", code: "same_plan" }, { status: 400 })
    }

    await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: item.id, price: priceId }],
      proration_behavior: "always_invoice",
      cancel_at_period_end: false,
    })

    return NextResponse.json({ ok: true, plan: { domains, billing } })
  } catch (error) {
    console.error("stripe.change-plan: subscription update failed", error)
    return NextResponse.json(
      { error: "Your plan couldn't be changed right now. Please try again later." },
      { status: 500 }
    )
  }
}
