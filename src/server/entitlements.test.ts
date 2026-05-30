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
  getTierForPriceId: vi.fn(() => ({ domains: 25, billing: "monthly" })),
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
})
