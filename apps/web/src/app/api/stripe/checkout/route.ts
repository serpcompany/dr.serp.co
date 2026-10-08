import { NextResponse } from 'next/server'
import { readNumberEnv } from '@/lib/env'
import type { BillingPeriod } from '@/lib/pricing'
import { getPublicBaseUrl } from '@/lib/public-url'
import { getStripe } from '@/lib/stripe'
import { getPriceId } from '@/lib/stripe-pricing'
import { getSessionEmail } from '@/server/auth-session.mjs'
import { resolveEntitlement } from '@/server/entitlements.mjs'
import {
  checkRateLimit,
  getRateLimitKey,
  RATE_LIMITER_UNAVAILABLE_MESSAGE
} from '@/server/rate-limit.mjs'
import { readWriteRequest } from '@/server/write-route'
import { CheckoutBody } from '@/server/write-schemas'

const ALLOWED_DOMAINS = [12, 25, 50, 100] as const

export async function POST(request: Request) {
  const read = await readWriteRequest(request, CheckoutBody)
  if (!read.ok) return read.response

  try {
    const rateKey = getRateLimitKey(request, 'stripe-checkout')
    const rate = await checkRateLimit({
      key: rateKey,
      points: readNumberEnv('CHECKOUT_RATE_LIMIT_POINTS', 20),
      duration: readNumberEnv('CHECKOUT_RATE_LIMIT_DURATION', 60)
    })
    if (rate.unavailable) {
      return NextResponse.json({ error: RATE_LIMITER_UNAVAILABLE_MESSAGE }, { status: 503 })
    }
    if (!rate.allowed) {
      const retryAfter = Math.ceil(rate.retryAfterMs / 1000)
      return NextResponse.json(
        { error: 'Too many checkout attempts. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      )
    }

    const domains = read.data.domains
    const billing = read.data.billing as BillingPeriod
    // Subscriptions are matched to accounts by email, so only use the signed-in email; Stripe collects one otherwise.
    const email = getSessionEmail(request)

    if (!ALLOWED_DOMAINS.includes(domains as (typeof ALLOWED_DOMAINS)[number])) {
      return NextResponse.json({ error: 'Invalid domain tier.' }, { status: 400 })
    }

    if (billing !== 'monthly' && billing !== 'annual') {
      return NextResponse.json({ error: 'Invalid billing period.' }, { status: 400 })
    }

    // A subscriber switches plans with /api/stripe/change-plan; a second checkout would bill twice.
    if (email) {
      const entitlement = await resolveEntitlement({ email })
      const current = entitlement?.subscription
      if (entitlement?.hasLivePlan && current) {
        return NextResponse.json(
          {
            error: 'You already have a plan. Switch it instead of buying a second one.',
            code: 'has_plan',
            plan: { domains: current.domainsLimit, billing: current.billingInterval }
          },
          { status: 409 }
        )
      }
    }

    const stripe = getStripe()
    const priceId = getPriceId(domains, billing)
    const metadata: Record<string, string> = {
      domains: String(domains),
      billing
    }
    if (email) metadata.email = email

    const baseUrl = getPublicBaseUrl()

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email || undefined,
      success_url: `${baseUrl}/pricing?checkout=success`,
      cancel_url: `${baseUrl}/pricing?checkout=cancelled`,
      metadata
    })

    if (!session.url) {
      return NextResponse.json({ error: 'Unable to create checkout session.' }, { status: 500 })
    }

    return NextResponse.json({ url: session.url })
  } catch (error) {
    // Stripe's and the config's messages stay in the log; the visitor sees a fixed one.
    console.error('stripe.checkout: session creation failed', error)
    return NextResponse.json(
      { error: 'Checkout is unavailable right now. Please try again later.' },
      { status: 500 }
    )
  }
}
