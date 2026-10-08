import { NextResponse } from "next/server"

import { getPublicBaseUrl } from "@/lib/public-url"
import { getStripe } from "@/lib/stripe"
import { getPriceId } from "@/lib/stripe-pricing"
import type { BillingPeriod } from "@/lib/pricing"
import { readRequestJsonRecord } from "@/lib/read-json"
import { getSessionEmail } from "@/server/auth-session.mjs"
import { checkRateLimit, getRateLimitKey } from "@/server/rate-limit.mjs"

const ALLOWED_DOMAINS = [12, 25, 50, 100] as const
const RATE_LIMIT_POINTS = Number(process.env.CHECKOUT_RATE_LIMIT_POINTS ?? 20)
const RATE_LIMIT_DURATION = Number(process.env.CHECKOUT_RATE_LIMIT_DURATION ?? 60)

export async function POST(request: Request) {
  try {
    const rateKey = getRateLimitKey(request, "stripe-checkout")
    const rate = await checkRateLimit({ key: rateKey, points: RATE_LIMIT_POINTS, duration: RATE_LIMIT_DURATION })
    if (!rate.allowed) {
      const retryAfter = Math.ceil(rate.retryAfterMs / 1000)
      return NextResponse.json(
        { error: "Too many checkout attempts. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      )
    }

    const body = await readRequestJsonRecord(request)
    const domains = Number(body?.domains)
    const billing = body?.billing as BillingPeriod
    // Subscriptions are matched to accounts by email, so only use the signed-in email; Stripe collects one otherwise.
    const email = getSessionEmail(request)

    if (!ALLOWED_DOMAINS.includes(domains as (typeof ALLOWED_DOMAINS)[number])) {
      return NextResponse.json({ error: "Invalid domain tier." }, { status: 400 })
    }

    if (billing !== "monthly" && billing !== "annual") {
      return NextResponse.json({ error: "Invalid billing period." }, { status: 400 })
    }

    const stripe = getStripe()
    const priceId = getPriceId(domains, billing)
    const metadata: Record<string, string> = {
      domains: String(domains),
      billing,
    }
    if (email) metadata.email = email

    const baseUrl = getPublicBaseUrl()

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email || undefined,
      success_url: `${baseUrl}/pricing?checkout=success`,
      cancel_url: `${baseUrl}/pricing?checkout=cancelled`,
      metadata,
    })

    if (!session.url) {
      return NextResponse.json({ error: "Unable to create checkout session." }, { status: 500 })
    }

    return NextResponse.json({ url: session.url })
  } catch (error) {
    // Stripe's and the config's messages stay in the log; the visitor sees a fixed one.
    console.error("stripe.checkout: session creation failed", error)
    return NextResponse.json({ error: "Checkout is unavailable right now. Please try again later." }, { status: 500 })
  }
}
