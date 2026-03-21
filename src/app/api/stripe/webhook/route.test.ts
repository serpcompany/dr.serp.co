import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import Stripe from "stripe"

import { resetServerEnv } from "@/lib/env"
import { resetStripePricingCache } from "@/lib/stripe-pricing"

let headerStore = new Headers()

vi.mock("next/headers", () => ({
  headers: () => headerStore,
}))

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
    STRIPE_WEBHOOK_SECRET: "whsec_test_123",
  })
  headerStore = new Headers()
  resetServerEnv()
  resetStripePricingCache()
})

afterEach(() => {
  restoreEnv()
})

describe("POST /api/stripe/webhook", () => {
  it("accepts a valid signature", async () => {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "")
    const payload = JSON.stringify({
      id: "evt_valid_1",
      type: "charge.succeeded",
      created: Math.floor(Date.now() / 1000),
      data: { object: {} },
    })
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET || "",
    })
    headerStore = new Headers({ "stripe-signature": signature })

    const { POST } = await import("./route")
    const request = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      body: payload,
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.received).toBe(true)
  })

  it("rejects an invalid signature", async () => {
    headerStore = new Headers({ "stripe-signature": "invalid" })

    const { POST } = await import("./route")
    const request = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({
        id: "evt_invalid_1",
        type: "charge.succeeded",
        data: { object: {} },
      }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBeTruthy()
  })
})
