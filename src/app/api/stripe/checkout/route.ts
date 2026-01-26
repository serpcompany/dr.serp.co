import { NextResponse } from "next/server"

import { getStripe } from "@/lib/stripe"
import { getPriceId } from "@/lib/stripe-pricing"
import type { BillingPeriod } from "@/lib/pricing"

const ALLOWED_DOMAINS = [12, 25, 50, 100] as const

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const domains = Number(body?.domains)
    const billing = body?.billing as BillingPeriod
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : null

    if (!ALLOWED_DOMAINS.includes(domains as (typeof ALLOWED_DOMAINS)[number])) {
      return NextResponse.json({ error: "Invalid domain tier." }, { status: 400 })
    }

    if (billing !== "monthly" && billing !== "annual") {
      return NextResponse.json({ error: "Invalid billing period." }, { status: 400 })
    }

    const stripe = getStripe()
    const priceId = getPriceId(domains, billing)

    const origin = request.headers.get("origin")
    const baseUrl =
      origin ?? process.env.DR_PUBLIC_BASE_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email || undefined,
      success_url: `${baseUrl}/pricing?checkout=success`,
      cancel_url: `${baseUrl}/pricing?checkout=cancelled`,
      metadata: {
        domains: String(domains),
        billing,
        email: email || undefined,
      },
    })

    if (!session.url) {
      return NextResponse.json({ error: "Unable to create checkout session." }, { status: 500 })
    }

    return NextResponse.json({ url: session.url })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
