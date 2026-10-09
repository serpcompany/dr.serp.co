import { NextResponse } from 'next/server'
import { getLatestSubscriptionByEmail } from '@/db'
import { readNumberEnv } from '@/lib/env'
import { getPublicBaseUrl } from '@/lib/public-url'
import { getStripe } from '@/lib/stripe'
import { getSessionEmail } from '@/server/auth/session'
import {
  checkRateLimit,
  getRateLimitKey,
  RATE_LIMITER_UNAVAILABLE_MESSAGE
} from '@/server/rate-limit.mjs'
import { EMPTY_BODY, readWriteRequest } from '@/server/write-route'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const read = await readWriteRequest(request, EMPTY_BODY)
  if (!read.ok) return read.response

  const rateKey = getRateLimitKey(request, 'stripe-portal')
  const rate = await checkRateLimit({
    key: rateKey,
    points: readNumberEnv('BILLING_PORTAL_RATE_LIMIT_POINTS', 10),
    duration: readNumberEnv('BILLING_PORTAL_RATE_LIMIT_DURATION', 60)
  })
  if (rate.unavailable) {
    return NextResponse.json({ error: RATE_LIMITER_UNAVAILABLE_MESSAGE }, { status: 503 })
  }
  if (!rate.allowed) {
    const retryAfter = Math.ceil(rate.retryAfterMs / 1000)
    return NextResponse.json(
      { error: 'Too many portal requests. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    )
  }

  const email = await getSessionEmail(request)
  if (!email) {
    return NextResponse.json({ error: 'Sign in required.', code: 'auth_required' }, { status: 401 })
  }

  const subscription = await getLatestSubscriptionByEmail(email)
  const customerId = subscription?.stripe_customer_id ?? null

  if (!customerId) {
    return NextResponse.json({ error: 'No active customer found for this email.' }, { status: 404 })
  }

  try {
    const stripe = getStripe()
    const baseUrl = getPublicBaseUrl()
    const returnUrl = process.env.STRIPE_PORTAL_RETURN_URL || `${baseUrl}/billing`

    // The Stripe account's default portal configuration belongs to another SERP product.
    const configuration = process.env.STRIPE_PORTAL_CONFIGURATION_ID || undefined
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
      ...(configuration ? { configuration } : {})
    })

    if (!session.url) {
      return NextResponse.json({ error: 'Unable to create portal session.' }, { status: 500 })
    }

    return NextResponse.json({ url: session.url })
  } catch (error) {
    // Stripe's message stays in the log; the visitor sees a fixed one.
    console.error('stripe.portal: session creation failed', error)
    return NextResponse.json({ error: 'Unable to create portal session.' }, { status: 500 })
  }
}
