import { getTierForPriceId } from "@/lib/stripe-pricing"
import { countClaimsByEmail, getLatestSubscriptionByEmail } from "@/server/db.mjs"
import { LIVE_SUBSCRIPTION_STATUSES } from "@/server/subscription-status.mjs"

const INTERNAL_PRO_EMAILS = new Set(["devin@serp.co", "otp@2faslingshot.com"])

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase()
}

function isInternalProEmail(email) {
  return INTERNAL_PRO_EMAILS.has(email)
}

function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

function resolveAccessStatus(status, currentPeriodEnd, now) {
  if (!status) return { status: "none", canAccessPaid: false, isGrace: false }

  if (status === "active" || status === "trialing") {
    return { status, canAccessPaid: true, isGrace: false }
  }

  const periodActive = currentPeriodEnd && currentPeriodEnd.getTime() > now.getTime()
  if (periodActive) {
    return { status: "grace", canAccessPaid: true, isGrace: true }
  }

  if (status === "past_due") return { status: "past_due", canAccessPaid: false, isGrace: false }
  if (status === "canceled") return { status: "canceled", canAccessPaid: false, isGrace: false }

  return { status: "inactive", canAccessPaid: false, isGrace: false }
}

function safeTierLookup(priceId) {
  if (!priceId) return null
  try {
    return getTierForPriceId(priceId)
  } catch (error) {
    // A broken STRIPE_PRICE_IDS: fail closed, but leave a trace.
    console.error("entitlements: price lookup failed", error instanceof Error ? error.message : error)
    return null
  }
}

export async function resolveEntitlement({ email, now = new Date() }) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) return null

  if (isInternalProEmail(normalizedEmail)) {
    const domainsUsed = await countClaimsByEmail({ email: normalizedEmail })
    return {
      email: normalizedEmail,
      status: "active",
      canAccessPaidFeatures: true,
      canClaim: true,
      domainsLimit: null,
      domainsUsed,
      remaining: null,
      isUnlimited: true,
      hasLivePlan: false,
      subscription: null,
    }
  }

  const [subscription, domainsUsed] = await Promise.all([
    getLatestSubscriptionByEmail(normalizedEmail),
    countClaimsByEmail({ email: normalizedEmail }),
  ])

  const currentPeriodEnd = toDate(subscription?.current_period_end)
  const tier = safeTierLookup(subscription?.stripe_price_id ?? null)
  // The Stripe account also sells other SERP products: a row whose price isn't a dr.serp.co tier
  // is no plan here, whatever its Stripe status.
  const access = tier
    ? resolveAccessStatus(subscription?.status ?? null, currentPeriodEnd, now)
    : resolveAccessStatus(null, null, now)

  const domainsLimitRaw = Number.isFinite(Number(subscription?.domains_limit))
    ? Number(subscription.domains_limit)
    : tier?.domains ?? 0
  const domainsLimit = Math.max(0, domainsLimitRaw || 0)

  const billingInterval = subscription?.billing_interval ?? tier?.billing ?? null

  const remaining = Math.max(0, domainsLimit - domainsUsed)
  const canAccessPaidFeatures = access.canAccessPaid
  const canClaim = canAccessPaidFeatures && domainsLimit > 0 && domainsUsed < domainsLimit
  // A dr.serp.co subscription that a plan change can move; checkout refuses a second one.
  const hasLivePlan = Boolean(
    tier && subscription?.stripe_subscription_id && LIVE_SUBSCRIPTION_STATUSES.has(subscription.status)
  )

  return {
    email: normalizedEmail,
    status: access.status,
    canAccessPaidFeatures,
    canClaim,
    domainsLimit,
    domainsUsed,
    remaining,
    isUnlimited: false,
    hasLivePlan,
    subscription: subscription
      ? {
          stripeCustomerId: subscription.stripe_customer_id ?? null,
          stripeSubscriptionId: subscription.stripe_subscription_id ?? null,
          stripePriceId: subscription.stripe_price_id ?? null,
          billingInterval,
          domainsLimit,
          status: subscription.status ?? null,
          currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancel_at_period_end ?? null,
        }
      : null,
  }
}
