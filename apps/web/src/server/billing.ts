// The card on the billing page (#143): read from Stripe at render, since D1 keeps no card details.
// Best effort: any failure, or no card on the subscription, leaves the row out.
import 'server-only'

import { getStripe } from '@/lib/stripe'
import { resolveEntitlement } from '@/server/entitlements.mjs'

const BRANDS: Record<string, string> = {
  amex: 'American Express',
  mastercard: 'Mastercard',
  visa: 'Visa',
  discover: 'Discover'
}

/** "Visa ending 4242", or null. */
export async function cardOf(email: string): Promise<string | null> {
  try {
    const entitlement = await resolveEntitlement({ email })
    const id = entitlement?.subscription?.stripeSubscriptionId
    if (!id) return null
    const subscription = await getStripe().subscriptions.retrieve(id, {
      expand: ['default_payment_method']
    })
    const method = subscription.default_payment_method
    const card = method && typeof method === 'object' ? method.card : null
    if (!card?.last4) return null
    return `${BRANDS[card.brand] ?? 'Card'} ending ${card.last4}`
  } catch (error) {
    console.error('billing: card lookup failed', error instanceof Error ? error.message : error)
    return null
  }
}
