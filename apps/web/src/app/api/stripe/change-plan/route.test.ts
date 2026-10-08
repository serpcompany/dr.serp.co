import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSessionEmail: vi.fn(),
  resolveEntitlement: vi.fn(),
  checkRateLimit: vi.fn(),
  retrieve: vi.fn(),
  update: vi.fn()
}))

vi.mock('@/server/auth-session.mjs', () => ({ getSessionEmail: mocks.getSessionEmail }))
vi.mock('@/server/entitlements.mjs', () => ({ resolveEntitlement: mocks.resolveEntitlement }))
vi.mock('@/server/rate-limit.mjs', () => ({
  RATE_LIMITER_UNAVAILABLE_MESSAGE: 'This is unavailable right now. Please try again shortly.',
  checkRateLimit: mocks.checkRateLimit,
  getRateLimitKey: () => 'stripe-change-plan:127.0.0.1'
}))
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({ subscriptions: { retrieve: mocks.retrieve, update: mocks.update } })
}))
vi.mock('@/lib/stripe-pricing', () => ({
  getPriceId: (domains: number, billing: string) =>
    `price_${domains}${billing === 'annual' ? 'a' : 'm'}`,
  getTierForPriceId: (priceId: string) =>
    /^price_\d+[am]$/.test(priceId) ? { domains: 12, billing: 'monthly' } : null
}))

function changePlan(body: unknown) {
  return new Request('http://localhost/api/stripe/change-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
    body: JSON.stringify(body)
  })
}

const subscriber = {
  canAccessPaidFeatures: true,
  hasLivePlan: true,
  domainsUsed: 3,
  subscription: { stripeSubscriptionId: 'sub_1', domainsLimit: 12, billingInterval: 'monthly' }
}

describe('POST /api/stripe/change-plan', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    mocks.getSessionEmail.mockReturnValue('owner@example.com')
    mocks.resolveEntitlement.mockResolvedValue(subscriber)
    mocks.checkRateLimit.mockResolvedValue({
      allowed: true,
      unavailable: false,
      remaining: 9,
      retryAfterMs: 0
    })
    mocks.retrieve.mockResolvedValue({
      id: 'sub_1',
      status: 'active',
      items: { data: [{ id: 'si_1', price: { id: 'price_12m' } }] }
    })
    mocks.update.mockResolvedValue({ id: 'sub_1' })
  })

  it('moves the existing subscription to the new price, prorated and invoiced now', async () => {
    const { POST } = await import('./route')
    const response = await POST(changePlan({ domains: 25, billing: 'annual' }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, plan: { domains: 25, billing: 'annual' } })
    expect(mocks.update).toHaveBeenCalledWith('sub_1', {
      items: [{ id: 'si_1', price: 'price_25a' }],
      proration_behavior: 'always_invoice',
      payment_behavior: 'error_if_incomplete'
    })
  })

  it('requires a signed-in session', async () => {
    mocks.getSessionEmail.mockReturnValue(null)
    const { POST } = await import('./route')

    expect((await POST(changePlan({ domains: 25, billing: 'monthly' }))).status).toBe(401)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('refuses without a plan, sending the buyer to checkout', async () => {
    mocks.resolveEntitlement.mockResolvedValue({
      canAccessPaidFeatures: false,
      hasLivePlan: false,
      subscription: null
    })
    const { POST } = await import('./route')
    const response = await POST(changePlan({ domains: 25, billing: 'monthly' }))

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'no_plan' })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it("never moves another product's subscription", async () => {
    mocks.retrieve.mockResolvedValue({
      id: 'sub_1',
      status: 'active',
      items: { data: [{ id: 'si_1', price: { id: 'price_lists' } }] }
    })
    const { POST } = await import('./route')

    expect((await POST(changePlan({ domains: 25, billing: 'monthly' }))).status).toBe(409)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('refuses a canceled subscription that still has paid access, sending the buyer to checkout', async () => {
    // D1 can lag behind Stripe, so the live status decides too.
    mocks.retrieve.mockResolvedValue({
      id: 'sub_1',
      status: 'canceled',
      items: { data: [{ id: 'si_1', price: { id: 'price_12m' } }] }
    })
    const { POST } = await import('./route')
    const response = await POST(changePlan({ domains: 25, billing: 'monthly' }))

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'no_plan' })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it.each(['past_due', 'unpaid'])(
    'sends a %s subscription to pay its open invoice first',
    async status => {
      mocks.retrieve.mockResolvedValue({
        id: 'sub_1',
        status,
        items: { data: [{ id: 'si_1', price: { id: 'price_12m' } }] }
      })
      const { POST } = await import('./route')
      const response = await POST(changePlan({ domains: 25, billing: 'monthly' }))

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ code: 'payment_due' })
      expect(mocks.update).not.toHaveBeenCalled()
    }
  )

  it('refuses when D1 has no live plan, even with paid access in grace', async () => {
    mocks.resolveEntitlement.mockResolvedValue({ ...subscriber, hasLivePlan: false })
    const { POST } = await import('./route')

    expect((await POST(changePlan({ domains: 25, billing: 'monthly' }))).status).toBe(409)
    expect(mocks.retrieve).not.toHaveBeenCalled()
  })

  it('refuses a plan smaller than the domains already claimed', async () => {
    mocks.resolveEntitlement.mockResolvedValue({
      ...subscriber,
      domainsUsed: 30,
      subscription: { ...subscriber.subscription, domainsLimit: 50 }
    })
    const { POST } = await import('./route')
    const response = await POST(changePlan({ domains: 25, billing: 'monthly' }))

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'too_many_claims' })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('lets a subscriber over their limit after a lapse change billing at the same size', async () => {
    mocks.resolveEntitlement.mockResolvedValue({ ...subscriber, domainsUsed: 30 })
    const { POST } = await import('./route')

    expect((await POST(changePlan({ domains: 12, billing: 'annual' }))).status).toBe(200)
    expect(mocks.update).toHaveBeenCalled()
  })

  it('leaves the plan unchanged and says so when the prorated charge fails', async () => {
    mocks.update.mockRejectedValue(
      Object.assign(new Error('Your card was declined.'), { statusCode: 402 })
    )
    const { POST } = await import('./route')
    const response = await POST(changePlan({ domains: 25, billing: 'monthly' }))

    expect(response.status).toBe(402)
    expect(await response.json()).toMatchObject({ code: 'payment_failed' })
  })

  it('refuses the plan the subscriber already has', async () => {
    const { POST } = await import('./route')
    const response = await POST(changePlan({ domains: 12, billing: 'monthly' }))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'same_plan' })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it("refuses a size that isn't sold", async () => {
    const { POST } = await import('./route')

    expect((await POST(changePlan({ domains: 13, billing: 'monthly' }))).status).toBe(400)
  })

  it('answers 503 while the rate limiter is down', async () => {
    mocks.checkRateLimit.mockResolvedValue({
      allowed: false,
      unavailable: true,
      remaining: 0,
      retryAfterMs: 60000
    })
    const { POST } = await import('./route')

    expect((await POST(changePlan({ domains: 25, billing: 'monthly' }))).status).toBe(503)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it("logs Stripe's error and returns a fixed message", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.update.mockRejectedValue(new Error('connect ETIMEDOUT'))
    const { POST } = await import('./route')
    const response = await POST(changePlan({ domains: 25, billing: 'monthly' }))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: "Your plan couldn't be changed right now. Please try again later."
    })
  })
})
