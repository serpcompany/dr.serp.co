import { NextResponse } from 'next/server'
import { countClaimsByEmail, listSubscriptions } from '@/db'
import { checkAdminToken } from '@/server/admin-auth.mjs'

export const runtime = 'nodejs'

async function loadAllSubscriptions() {
  const rows = []
  let offset = 0
  while (true) {
    const batch = await listSubscriptions({ limit: 200, offset })
    if (!batch.length) break
    rows.push(...batch)
    offset += batch.length
  }
  return rows
}

export async function GET(request: Request) {
  const denied = checkAdminToken(request)
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status })

  const subscriptions = await loadAllSubscriptions()
  const emails = Array.from(new Set(subscriptions.map(row => row.email).filter(Boolean)))

  const counts = await Promise.all(
    emails.map(async email => {
      const total = await countClaimsByEmail({ email })
      return [email, total] as const
    })
  )
  const countsMap = new Map(counts)

  const report = subscriptions.map(row => ({
    email: row.email,
    stripeSubscriptionId: row.stripe_subscription_id,
    stripeCustomerId: row.stripe_customer_id ?? null,
    stripePriceId: row.stripe_price_id ?? null,
    billingInterval: row.billing_interval ?? null,
    domainsLimit: row.domains_limit ?? null,
    plan: row.domains_limit ? `${row.domains_limit} domains` : 'Free',
    status: row.status ?? null,
    currentPeriodEnd: row.current_period_end ?? null,
    cancelAtPeriodEnd: row.cancel_at_period_end ?? null,
    domainsUsed: countsMap.get(row.email) ?? 0,
    updatedAt: row.updated_at ?? null
  }))

  return NextResponse.json({ ok: true, total: report.length, report })
}
