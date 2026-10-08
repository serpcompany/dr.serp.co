import { beforeEach, describe, expect, it, vi } from "vitest"

import { resolveEntitlement } from "@/server/entitlements.mjs"

const mocks = vi.hoisted(() => ({
  getLatestSubscriptionByEmail: vi.fn(),
  countClaimsByEmail: vi.fn(),
}))

vi.mock("@/server/db.mjs", () => ({
  getLatestSubscriptionByEmail: mocks.getLatestSubscriptionByEmail,
  countClaimsByEmail: mocks.countClaimsByEmail,
}))

vi.mock("@/lib/stripe-pricing", () => ({
  // Like the real function: null for a price that isn't dr.serp.co's.
  getTierForPriceId: vi.fn((priceId: string) => (priceId === "price_25m" ? { domains: 25, billing: "monthly" } : null)),
}))

const baseNow = new Date("2026-01-01T00:00:00Z")

beforeEach(() => {
  mocks.getLatestSubscriptionByEmail.mockReset()
  mocks.countClaimsByEmail.mockReset()
  mocks.countClaimsByEmail.mockResolvedValue(3)
})

describe("resolveEntitlement", () => {
  it.each(["devin@serp.co", "OTP@2FASlingshot.com"])(
    "grants unlimited paid access to owner account %s",
    async (email) => {
      mocks.getLatestSubscriptionByEmail.mockResolvedValue({
        stripe_subscription_id: "sub_canceled",
        status: "canceled",
        domains_limit: 0,
        billing_interval: "monthly",
        current_period_end: new Date("2025-12-15T00:00:00Z"),
        cancel_at_period_end: true,
      })
      mocks.countClaimsByEmail.mockResolvedValue(137)

      const result = await resolveEntitlement({ email, now: baseNow })

      expect(result).toMatchObject({
        email: email.toLowerCase(),
        status: "active",
        canAccessPaidFeatures: true,
        canClaim: true,
        domainsLimit: null,
        domainsUsed: 137,
        remaining: null,
        isUnlimited: true,
        subscription: null,
      })
      expect(mocks.getLatestSubscriptionByEmail).not.toHaveBeenCalled()
      expect(mocks.countClaimsByEmail).toHaveBeenCalledWith({ email: email.toLowerCase() })
    }
  )

  it("marks active subscriptions as paid access", async () => {
    mocks.getLatestSubscriptionByEmail.mockResolvedValue({
      stripe_subscription_id: "sub_active",
      stripe_price_id: "price_25m",
      status: "active",
      domains_limit: 12,
      billing_interval: "monthly",
      current_period_end: new Date("2026-02-01T00:00:00Z"),
      cancel_at_period_end: false,
    })

    const result = await resolveEntitlement({ email: "test@example.com", now: baseNow })

    expect(result?.status).toBe("active")
    expect(result?.canAccessPaidFeatures).toBe(true)
    expect(result?.domainsLimit).toBe(12)
  })

  it("marks trialing subscriptions as paid access", async () => {
    mocks.getLatestSubscriptionByEmail.mockResolvedValue({
      stripe_subscription_id: "sub_trial",
      stripe_price_id: "price_25m",
      status: "trialing",
      domains_limit: 25,
      billing_interval: "monthly",
      current_period_end: new Date("2026-02-01T00:00:00Z"),
      cancel_at_period_end: false,
    })

    const result = await resolveEntitlement({ email: "trial@example.com", now: baseNow })

    expect(result?.status).toBe("trialing")
    expect(result?.canAccessPaidFeatures).toBe(true)
  })

  it("treats past_due with expired period as unpaid", async () => {
    mocks.getLatestSubscriptionByEmail.mockResolvedValue({
      stripe_subscription_id: "sub_past_due",
      stripe_price_id: "price_25m",
      status: "past_due",
      domains_limit: 25,
      billing_interval: "monthly",
      current_period_end: new Date("2025-12-15T00:00:00Z"),
      cancel_at_period_end: false,
    })

    const result = await resolveEntitlement({ email: "pastdue@example.com", now: baseNow })

    expect(result?.status).toBe("past_due")
    expect(result?.canAccessPaidFeatures).toBe(false)
  })

  it("treats canceled with expired period as inactive", async () => {
    mocks.getLatestSubscriptionByEmail.mockResolvedValue({
      stripe_subscription_id: "sub_canceled",
      stripe_price_id: "price_25m",
      status: "canceled",
      domains_limit: 25,
      billing_interval: "monthly",
      current_period_end: new Date("2025-12-15T00:00:00Z"),
      cancel_at_period_end: true,
    })

    const result = await resolveEntitlement({ email: "canceled@example.com", now: baseNow })

    expect(result?.status).toBe("canceled")
    expect(result?.canAccessPaidFeatures).toBe(false)
  })

  it("treats past_due with future period end as grace", async () => {
    mocks.getLatestSubscriptionByEmail.mockResolvedValue({
      stripe_subscription_id: "sub_grace",
      stripe_price_id: "price_25m",
      status: "past_due",
      domains_limit: 25,
      billing_interval: "monthly",
      current_period_end: new Date("2026-02-01T00:00:00Z"),
      cancel_at_period_end: false,
    })

    const result = await resolveEntitlement({ email: "grace@example.com", now: baseNow })

    expect(result?.status).toBe("grace")
    expect(result?.canAccessPaidFeatures).toBe(true)
  })

  it("grants nothing for an active subscription on another product's price", async () => {
    mocks.getLatestSubscriptionByEmail.mockResolvedValue({
      stripe_subscription_id: "sub_lists",
      stripe_price_id: "price_1SsjeTCt1irzGjqBfVd0YRM9",
      status: "active",
      domains_limit: null,
      current_period_end: new Date("2026-02-01T00:00:00Z"),
    })

    const result = await resolveEntitlement({ email: "lists@example.com", now: baseNow })

    expect(result).toMatchObject({ status: "none", canAccessPaidFeatures: false, canClaim: false })
  })

  it.each([
    ["active", "2026-02-01T00:00:00Z", true],
    ["trialing", "2026-02-01T00:00:00Z", true],
    ["past_due", "2026-02-01T00:00:00Z", true],
    ["past_due", "2025-12-15T00:00:00Z", true],
    ["unpaid", "2025-12-15T00:00:00Z", true],
    ["canceled", "2026-12-01T00:00:00Z", false],
    ["incomplete_expired", "2026-02-01T00:00:00Z", false],
  ])("counts a %s subscription ending %s as a live plan: %s", async (status, periodEnd, live) => {
    mocks.getLatestSubscriptionByEmail.mockResolvedValue({
      stripe_subscription_id: "sub_1",
      stripe_price_id: "price_25m",
      status,
      domains_limit: 25,
      billing_interval: "monthly",
      current_period_end: new Date(periodEnd),
    })

    const result = await resolveEntitlement({ email: "plan@example.com", now: baseNow })

    expect(result?.hasLivePlan).toBe(live)
  })

  it("never counts another product's subscription as a live plan", async () => {
    mocks.getLatestSubscriptionByEmail.mockResolvedValue({
      stripe_subscription_id: "sub_lists",
      stripe_price_id: "price_lists",
      status: "active",
      current_period_end: new Date("2026-02-01T00:00:00Z"),
    })

    expect((await resolveEntitlement({ email: "lists@example.com", now: baseNow }))?.hasLivePlan).toBe(false)
  })
})
