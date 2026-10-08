// Configuration changes take effect on the next call, with no module reset (#71).
import { afterEach, describe, expect, it, vi } from "vitest"

import { readNumberEnv } from "@/lib/env"
import { getStripe } from "@/lib/stripe"
import { getPriceId, getTierForPriceId } from "@/lib/stripe-pricing"

function priceIds(suffix: string) {
  return JSON.stringify({
    monthly: { "12": `price_12m${suffix}`, "25": "price_25m", "50": "price_50m", "100": "price_100m" },
    annual: { "12": "price_12a", "25": "price_25a", "50": "price_50a", "100": "price_100a" },
  })
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("configuration read per call", () => {
  it("reads a numeric setting each time, with its default when unset", () => {
    expect(readNumberEnv("DR_TEST_POINTS", 10)).toBe(10)
    vi.stubEnv("DR_TEST_POINTS", "3")
    expect(readNumberEnv("DR_TEST_POINTS", 10)).toBe(3)
  })

  it("uses a changed STRIPE_PRICE_IDS on the next call", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_1")
    vi.stubEnv("STRIPE_PRICE_IDS", priceIds("_old"))
    expect(getPriceId(12, "monthly")).toBe("price_12m_old")

    vi.stubEnv("STRIPE_PRICE_IDS", priceIds("_new"))
    expect(getPriceId(12, "monthly")).toBe("price_12m_new")
    expect(getTierForPriceId("price_12m_old")).toBeNull()
  })

  it("builds a new Stripe client when the secret key changes, and reuses it otherwise", () => {
    vi.stubEnv("STRIPE_PRICE_IDS", priceIds(""))
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_1")
    const first = getStripe()
    expect(getStripe()).toBe(first)

    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_2")
    expect(getStripe()).not.toBe(first)
  })
})
