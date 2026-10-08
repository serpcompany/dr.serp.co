import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const limiter = vi.hoisted(() => vi.fn(async () => ({ allowed: true, unavailable: false, remaining: 9, retryAfterMs: 0 })))
const createCheckoutSession = vi.fn()
const createPortalSession = vi.fn()

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    checkout: { sessions: { create: createCheckoutSession } },
    billingPortal: { sessions: { create: createPortalSession } },
  }),
}))

vi.mock("@/lib/stripe-pricing", () => ({
  getPriceId: () => "price_12m",
}))

vi.mock("@/server/auth-session.mjs", () => ({
  getSessionEmail: () => "owner@example.com",
}))

const resolveEntitlement = vi.hoisted(() => vi.fn())

vi.mock("@/server/entitlements.mjs", () => ({ resolveEntitlement }))

vi.mock("@/server/db.mjs", () => ({
  getLatestSubscriptionByEmail: async () => ({ stripe_customer_id: "cus_1" }),
}))

vi.mock("@/server/rate-limit.mjs", () => ({
  RATE_LIMITER_UNAVAILABLE_MESSAGE: "This is unavailable right now. Please try again shortly.",
  checkRateLimit: limiter,
  getRateLimitKey: () => "test:127.0.0.1",
}))

// A same-origin request (the Origin check refuses any other) to a host that isn't the configured
// one, so the URLs Stripe gets prove they come from DR_PUBLIC_BASE_URL, not from the request.
function siteRequest(path: string, body: unknown, origin = "https://dr.serp.co") {
  return new Request(`https://dr.serp.co${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  })
}

describe("Stripe return URLs", () => {
  beforeEach(() => {
    // Not the code's fallback, and with a trailing slash, so the test proves the setting is read.
    vi.stubEnv("DR_PUBLIC_BASE_URL", "https://staging.dr.example/")
    vi.stubEnv("STRIPE_PORTAL_RETURN_URL", "")
    vi.stubEnv("STRIPE_PORTAL_CONFIGURATION_ID", "")
    resolveEntitlement.mockReset().mockResolvedValue({ canAccessPaidFeatures: false, hasLivePlan: false, subscription: null })
    createCheckoutSession.mockReset().mockResolvedValue({ url: "https://checkout.stripe.com/c/1" })
    createPortalSession.mockReset().mockResolvedValue({ url: "https://billing.stripe.com/p/1" })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("checkout builds its URLs from the configured host, not the request", async () => {
    const { POST } = await import("./checkout/route")
    const response = await POST(siteRequest("/api/stripe/checkout", { domains: 12, billing: "monthly" }))

    expect(response.status).toBe(200)
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: "https://staging.dr.example/pricing?checkout=success",
        cancel_url: "https://staging.dr.example/pricing?checkout=cancelled",
      })
    )
  })

  it("the portal builds its URL from the configured host, not the request", async () => {
    const { POST } = await import("./portal/route")
    const response = await POST(siteRequest("/api/stripe/portal", {}))

    expect(response.status).toBe(200)
    expect(createPortalSession).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_1", return_url: "https://staging.dr.example/billing" })
    )
    // Unset: no configuration key at all, since Stripe rejects an empty one.
    expect(createPortalSession.mock.calls[0][0]).not.toHaveProperty("configuration")
  })

  it("the portal returns a fixed message when Stripe fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    createPortalSession.mockRejectedValue(new Error("No such customer: 'cus_1'; a similar object exists in live mode"))

    const { POST } = await import("./portal/route")
    const response = await POST(siteRequest("/api/stripe/portal", {}))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "Unable to create portal session." })
  })

  it("refuses a checkout from a foreign Origin before calling Stripe", async () => {
    const { POST } = await import("./checkout/route")
    const response = await POST(siteRequest("/api/stripe/checkout", { domains: 12, billing: "monthly" }, "https://evil.serp.co"))

    expect(response.status).toBe(403)
    expect(createCheckoutSession).not.toHaveBeenCalled()
  })

  it("the portal uses dr.serp.co's configuration when one is set", async () => {
    vi.stubEnv("STRIPE_PORTAL_CONFIGURATION_ID", "bpc_dr")
    const { POST } = await import("./portal/route")
    const response = await POST(siteRequest("/api/stripe/portal", {}))

    expect(response.status).toBe(200)
    expect(createPortalSession).toHaveBeenCalledWith(expect.objectContaining({ configuration: "bpc_dr" }))
  })

  it("checkout and the portal answer 503 while the rate limiter is down, before calling Stripe", async () => {
    limiter.mockResolvedValueOnce({ allowed: false, unavailable: true, remaining: 0, retryAfterMs: 60000 }).mockResolvedValueOnce({ allowed: false, unavailable: true, remaining: 0, retryAfterMs: 60000 })
    const checkout = (await import("./checkout/route")).POST
    const portal = (await import("./portal/route")).POST

    const checkoutResponse = await checkout(siteRequest("/api/stripe/checkout", { domains: 12, billing: "monthly" }))
    const portalResponse = await portal(siteRequest("/api/stripe/portal", {}))

    expect(checkoutResponse.status).toBe(503)
    expect(await checkoutResponse.json()).toEqual({ error: "This is unavailable right now. Please try again shortly." })
    expect(portalResponse.status).toBe(503)
    expect(createCheckoutSession).not.toHaveBeenCalled()
    expect(createPortalSession).not.toHaveBeenCalled()
  })

  it("refuses a second checkout for a subscriber, naming their plan", async () => {
    resolveEntitlement.mockResolvedValue({
      canAccessPaidFeatures: true,
      hasLivePlan: true,
      subscription: { stripeSubscriptionId: "sub_1", domainsLimit: 12, billingInterval: "monthly" },
    })
    const { POST } = await import("./checkout/route")
    const response = await POST(siteRequest("/api/stripe/checkout", { domains: 25, billing: "monthly" }))

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: "has_plan", plan: { domains: 12, billing: "monthly" } })
    expect(createCheckoutSession).not.toHaveBeenCalled()
  })

  it("lets a lapsed subscriber still in grace buy again", async () => {
    resolveEntitlement.mockResolvedValue({
      canAccessPaidFeatures: true,
      hasLivePlan: false,
      subscription: { stripeSubscriptionId: "sub_1", status: "canceled", domainsLimit: 12, billingInterval: "annual" },
    })
    const { POST } = await import("./checkout/route")
    const response = await POST(siteRequest("/api/stripe/checkout", { domains: 25, billing: "monthly" }))

    expect(response.status).toBe(200)
    expect(createCheckoutSession).toHaveBeenCalled()
  })
})
