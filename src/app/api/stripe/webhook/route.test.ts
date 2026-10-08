import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import Stripe from "stripe"

import { resetServerEnv } from "@/lib/env"
import { resetStripePricingCache } from "@/lib/stripe-pricing"

let headerStore = new Headers()

vi.mock("next/headers", () => ({
  headers: () => headerStore,
}))

const upsertSubscription = vi.fn()
const insertBillingAudit = vi.fn()
const retrieveSubscription = vi.fn()
const retrieveCustomer = vi.fn()

vi.mock("@/server/db.mjs", () => ({
  getLatestBillingAuditEvent: vi.fn(),
  getLatestBillingAuditFailure: vi.fn(),
  insertBillingAudit,
  upsertSubscription,
}))

vi.mock("@/server/rate-limit.mjs", () => ({
  RATE_LIMITER_UNAVAILABLE_MESSAGE: "This is unavailable right now. Please try again shortly.",
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 119, retryAfterMs: 0 })),
  getRateLimitKey: vi.fn(() => "stripe-webhook:127.0.0.1"),
}))

// Signatures use the real SDK; API calls are stubbed.
vi.mock("@/lib/stripe", async () => {
  const { default: StripeSdk } = await vi.importActual<typeof import("stripe")>("stripe")
  const sdk = new StripeSdk("sk_test_123")
  return {
    getStripe: () => ({
      webhooks: sdk.webhooks,
      subscriptions: { retrieve: retrieveSubscription },
      customers: { retrieve: retrieveCustomer },
    }),
  }
})

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
  upsertSubscription.mockReset()
  insertBillingAudit.mockReset()
  retrieveSubscription.mockReset()
  retrieveCustomer.mockReset()
  retrieveCustomer.mockResolvedValue({ id: "cus_1", email: "Owner@Example.com" })
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
    expect(payload).toEqual({ error: "Invalid signature." })
  })
})

function signedRequest(event: Record<string, unknown>) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "")
  const payload = JSON.stringify({ created: 1790000000, ...event })
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET || "",
  })
  headerStore = new Headers({ "stripe-signature": signature })
  return new Request("http://localhost/api/stripe/webhook", { method: "POST", body: payload })
}

// What subscriptions.retrieve returns: the SDK pins API version 2023-10-16.
const retrievedSubscription = {
  id: "sub_1",
  customer: "cus_1",
  status: "active",
  cancel_at_period_end: false,
  current_period_end: 1792000000,
  items: { data: [{ price: { id: "price_25m", recurring: { interval: "month" } } }] },
}

describe("POST /api/stripe/webhook payload shapes", () => {
  it("syncs a basil invoice.paid, whose subscription is under parent.subscription_details", async () => {
    retrieveSubscription.mockResolvedValue(retrievedSubscription)

    const { POST } = await import("./route")
    const response = await POST(
      signedRequest({
        id: "evt_invoice_basil",
        type: "invoice.paid",
        data: {
          object: {
            id: "in_1",
            object: "invoice",
            parent: { type: "subscription_details", subscription_details: { subscription: "sub_1" } },
          },
        },
      })
    )

    expect(response.status).toBe(200)
    expect(retrieveSubscription).toHaveBeenCalledWith("sub_1")
    expect(upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "owner@example.com",
        stripeSubscriptionId: "sub_1",
        domainsLimit: 25,
        status: "active",
        currentPeriodEnd: new Date(1792000000 * 1000),
      })
    )
    expect(insertBillingAudit).toHaveBeenCalledWith(
      expect.objectContaining({ stripeEventId: "evt_invoice_basil", success: true })
    )
  })

  it("still syncs a legacy invoice.paid with a top-level subscription", async () => {
    retrieveSubscription.mockResolvedValue(retrievedSubscription)

    const { POST } = await import("./route")
    const response = await POST(
      signedRequest({
        id: "evt_invoice_legacy",
        type: "invoice.paid",
        data: { object: { id: "in_2", object: "invoice", subscription: "sub_1" } },
      })
    )

    expect(response.status).toBe(200)
    expect(retrieveSubscription).toHaveBeenCalledWith("sub_1")
    expect(insertBillingAudit).toHaveBeenCalledWith(
      expect.objectContaining({ stripeEventId: "evt_invoice_legacy", success: true })
    )
  })

  it("records a failure for an invoice with no subscription in either shape", async () => {
    const { POST } = await import("./route")
    const response = await POST(
      signedRequest({
        id: "evt_invoice_none",
        type: "invoice.paid",
        data: { object: { id: "in_3", object: "invoice", parent: null } },
      })
    )

    expect(response.status).toBe(200)
    expect(retrieveSubscription).not.toHaveBeenCalled()
    expect(insertBillingAudit).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: "invoice missing subscription" })
    )
  })

  it("stores the period end from the item on a basil customer.subscription.updated", async () => {
    const { POST } = await import("./route")
    const response = await POST(
      signedRequest({
        id: "evt_sub_basil",
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_1",
            object: "subscription",
            customer: "cus_1",
            status: "active",
            cancel_at_period_end: false,
            items: {
              data: [
                {
                  current_period_start: 1789000000,
                  current_period_end: 1794000000,
                  price: { id: "price_25m", recurring: { interval: "month" } },
                },
              ],
            },
          },
        },
      })
    )

    expect(response.status).toBe(200)
    expect(upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ stripeSubscriptionId: "sub_1", currentPeriodEnd: new Date(1794000000 * 1000) })
    )
  })

  it("records a handler error in the audit row and returns a fixed 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    retrieveSubscription.mockRejectedValue(new Error("D1_ERROR: no such table: dr_subscriptions"))

    const { POST } = await import("./route")
    const response = await POST(
      signedRequest({
        id: "evt_handler_error",
        type: "invoice.paid",
        data: { object: { id: "in_4", object: "invoice", subscription: "sub_1" } },
      })
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "Webhook handler failed." })
    expect(insertBillingAudit).toHaveBeenCalledWith(
      expect.objectContaining({ stripeEventId: "evt_handler_error", success: false, error: "D1_ERROR: no such table: dr_subscriptions" })
    )
  })

  it("ignores another product's invoice.paid: no subscription row, a successful ignored audit row", async () => {
    retrieveSubscription.mockResolvedValue({
      ...retrievedSubscription,
      id: "sub_lists",
      items: { data: [{ price: { id: "price_1SsjeTCt1irzGjqBfVd0YRM9", recurring: { interval: "month" } } }] },
    })

    const { POST } = await import("./route")
    const response = await POST(
      signedRequest({
        id: "evt_lists_invoice",
        type: "invoice.paid",
        data: {
          object: {
            id: "in_lists",
            object: "invoice",
            parent: { type: "subscription_details", subscription_details: { subscription: "sub_lists" } },
          },
        },
      })
    )

    expect(response.status).toBe(200)
    expect(upsertSubscription).not.toHaveBeenCalled()
    expect(insertBillingAudit).toHaveBeenCalledWith({
      stripeEventId: "evt_lists_invoice",
      stripeEventType: "invoice.paid",
      eventCreatedAt: expect.any(Date),
      stripeSubscriptionId: "sub_lists",
      stripePriceId: "price_1SsjeTCt1irzGjqBfVd0YRM9",
      success: true,
      error: "Ignored: not a dr.serp.co price.",
    })
  })

  it("ignores another product's customer.subscription.updated", async () => {
    const { POST } = await import("./route")
    const response = await POST(
      signedRequest({
        id: "evt_lists_sub",
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_lists",
            object: "subscription",
            customer: "cus_1",
            status: "active",
            items: { data: [{ current_period_end: 1794000000, price: { id: "price_1SsjeTCt1irzGjqBfVd0YRM9" } }] },
          },
        },
      })
    )

    expect(response.status).toBe(200)
    expect(upsertSubscription).not.toHaveBeenCalled()
    expect(insertBillingAudit).toHaveBeenCalledWith(expect.objectContaining({ success: true, error: "Ignored: not a dr.serp.co price." }))
  })

  it("fails with 500 and a failed audit row when STRIPE_PRICE_IDS is broken, so Stripe retries", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    process.env.STRIPE_PRICE_IDS = "{not json"
    resetServerEnv()
    resetStripePricingCache()
    retrieveSubscription.mockResolvedValue(retrievedSubscription)

    const { POST } = await import("./route")
    const response = await POST(
      signedRequest({
        id: "evt_broken_config",
        type: "invoice.paid",
        data: { object: { id: "in_5", object: "invoice", subscription: "sub_1" } },
      })
    )

    expect(response.status).toBe(500)
    expect(upsertSubscription).not.toHaveBeenCalled()
    expect(insertBillingAudit).toHaveBeenCalledWith(
      expect.objectContaining({ stripeEventId: "evt_broken_config", success: false })
    )
  })

  it("syncs a dr.serp.co checkout.session.completed with the session's email", async () => {
    retrieveSubscription.mockResolvedValue(retrievedSubscription)

    const { POST } = await import("./route")
    const response = await POST(
      signedRequest({
        id: "evt_checkout",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_1",
            object: "checkout.session",
            subscription: "sub_1",
            customer_details: { email: "Buyer@Example.com" },
          },
        },
      })
    )

    expect(response.status).toBe(200)
    expect(retrieveSubscription).toHaveBeenCalledWith("sub_1")
    expect(upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ email: "buyer@example.com", stripeSubscriptionId: "sub_1", domainsLimit: 25 })
    )
  })
})
