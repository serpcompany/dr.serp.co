// The billing page's card row: read from Stripe, best effort.
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const retrieve = vi.fn()
vi.mock('@/lib/stripe', () => ({ getStripe: () => ({ subscriptions: { retrieve } }) }))
const resolveEntitlement = vi.fn()
vi.mock('@/server/entitlements.mjs', () => ({ resolveEntitlement }))

const { cardOf } = await import('./billing')

afterEach(() => {
  retrieve.mockReset()
  resolveEntitlement.mockReset()
  vi.restoreAllMocks()
})

const withSubscription = { subscription: { stripeSubscriptionId: 'sub_1' } }

describe('cardOf', () => {
  it("names the subscription's card, with a short timeout", async () => {
    resolveEntitlement.mockResolvedValue(withSubscription)
    retrieve.mockResolvedValue({
      default_payment_method: { card: { brand: 'visa', last4: '4242' } }
    })
    expect(await cardOf('owner@example.com')).toBe('Visa ending 4242')
    expect(retrieve).toHaveBeenCalledWith(
      'sub_1',
      { expand: ['default_payment_method'] },
      { timeout: 3_000, maxNetworkRetries: 0 }
    )
  })

  it('is null without a subscription, a card, or an answer from Stripe', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    resolveEntitlement.mockResolvedValue({ subscription: null })
    expect(await cardOf('owner@example.com')).toBeNull()
    expect(retrieve).not.toHaveBeenCalled()
    resolveEntitlement.mockResolvedValue(withSubscription)
    retrieve.mockResolvedValue({ default_payment_method: 'pm_1' })
    expect(await cardOf('owner@example.com')).toBeNull()
    retrieve.mockRejectedValue(new Error('Request timed out'))
    expect(await cardOf('owner@example.com')).toBeNull()
  })
})
