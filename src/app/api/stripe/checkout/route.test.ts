import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { resetServerEnv } from "@/lib/env"
import { resetStripePricingCache } from "@/lib/stripe-pricing"

const PRICE_IDS = JSON.stringify({
  monthly: { "12": "price_12m", "25": "price_25m", "50": "price_50m", "100": "price_100m" },
  annual: { "12": "price_12a", "25": "price_25a", "50": "price_50a", "100": "price_100a" },
})

const envBackup = { ...process.env }

function restoreEnv() {
  for (const key of Object.keys(process.env)) delete process.env[key]
  Object.assign(process.env, envBackup)
  resetServerEnv()
  resetStripePricingCache()
}

beforeEach(() => {
  Object.assign(process.env, {
    STRIPE_SECRET_KEY: "sk_test_123",
    STRIPE_PRICE_IDS: PRICE_IDS,
  })
  resetServerEnv()
  resetStripePricingCache()
})

afterEach(() => {
  restoreEnv()
})

describe("POST /api/stripe/checkout", () => {
  it("rejects invalid domain tiers", async () => {
    const { POST } = await import("./route")
    const request = new Request("http://localhost/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
      body: JSON.stringify({ domains: 13, billing: "monthly" }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe("Invalid domain tier.")
  })

  it("rejects invalid billing periods", async () => {
    const { POST } = await import("./route")
    const request = new Request("http://localhost/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
      body: JSON.stringify({ domains: 12, billing: "weekly" }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe("Invalid billing period.")
  })

  it("returns a 500 when required Stripe env vars are missing", async () => {
    delete process.env.STRIPE_SECRET_KEY
    resetServerEnv()
    resetStripePricingCache()

    const { POST } = await import("./route")
    const request = new Request("http://localhost/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
      body: JSON.stringify({ domains: 12, billing: "monthly" }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(500)
    // The config error stays in the log; the visitor sees a fixed message.
    expect(payload.error).toBe("Checkout is unavailable right now. Please try again later.")
    expect(JSON.stringify(payload)).not.toContain("STRIPE_SECRET_KEY")
  })
})
