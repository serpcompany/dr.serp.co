import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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

vi.mock("@/server/db.mjs", () => ({
  getLatestSubscriptionByEmail: async () => ({ stripe_customer_id: "cus_1" }),
}))

vi.mock("@/server/rate-limit.mjs", () => ({
  checkRateLimit: async () => ({ allowed: true, remaining: 9, retryAfterMs: 0 }),
  getRateLimitKey: () => "test:127.0.0.1",
}))

function forgedRequest(path: string, body: unknown) {
  return new Request(`https://dr.serp.co${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
    body: JSON.stringify(body),
  })
}

describe("Stripe return URLs", () => {
  beforeEach(() => {
    vi.stubEnv("DR_PUBLIC_BASE_URL", "https://dr.serp.co")
    vi.stubEnv("STRIPE_PORTAL_RETURN_URL", "")
    createCheckoutSession.mockReset().mockResolvedValue({ url: "https://checkout.stripe.com/c/1" })
    createPortalSession.mockReset().mockResolvedValue({ url: "https://billing.stripe.com/p/1" })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("checkout ignores a forged Origin", async () => {
    const { POST } = await import("./checkout/route")
    const response = await POST(forgedRequest("/api/stripe/checkout", { domains: 12, billing: "monthly" }))

    expect(response.status).toBe(200)
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: "https://dr.serp.co/pricing?checkout=success",
        cancel_url: "https://dr.serp.co/pricing?checkout=cancelled",
      })
    )
  })

  it("the portal ignores a forged Origin", async () => {
    const { POST } = await import("./portal/route")
    const response = await POST(forgedRequest("/api/stripe/portal", {}))

    expect(response.status).toBe(200)
    expect(createPortalSession).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_1", return_url: "https://dr.serp.co/billing" })
    )
  })
})
