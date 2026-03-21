import { NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"

import { getStripe } from "@/lib/stripe"
import { getLatestSubscriptionByEmail } from "@/server/db.mjs"
import { checkRateLimit, getRateLimitKey } from "@/server/rate-limit.mjs"

function isValidEmail(email: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
}

export const runtime = "nodejs"
const RATE_LIMIT_POINTS = Number(process.env.BILLING_PORTAL_RATE_LIMIT_POINTS ?? 10)
const RATE_LIMIT_DURATION = Number(process.env.BILLING_PORTAL_RATE_LIMIT_DURATION ?? 60)

export async function POST(request: Request) {
  const rateKey = getRateLimitKey(request, "stripe-portal")
  const rate = await checkRateLimit({ key: rateKey, points: RATE_LIMIT_POINTS, duration: RATE_LIMIT_DURATION })
  if (!rate.allowed) {
    const retryAfter = Math.ceil(rate.retryAfterMs / 1000)
    return NextResponse.json(
      { error: "Too many portal requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    )
  }

  const body = await request.json().catch(() => ({}))
  const email = String((body as any)?.email || "").trim().toLowerCase()

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 })
  }

  const subscription = await getLatestSubscriptionByEmail(email)
  const customerId = subscription?.stripe_customer_id ?? null

  if (!customerId) {
    return NextResponse.json({ error: "No active customer found for this email." }, { status: 404 })
  }

  try {
    const stripe = getStripe()
    const origin = request.headers.get("origin")
    const baseUrl =
      origin ?? process.env.DR_PUBLIC_BASE_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"
    const returnUrl = process.env.STRIPE_PORTAL_RETURN_URL || `${baseUrl}/billing`

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    })

    if (!session.url) {
      return NextResponse.json({ error: "Unable to create portal session." }, { status: 500 })
    }

    return NextResponse.json({ url: session.url })
  } catch (error) {
    Sentry.captureException(error)
    const message = error instanceof Error ? error.message : "Unable to create portal session."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
