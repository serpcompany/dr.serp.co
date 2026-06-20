import { beforeEach, describe, expect, it, vi } from "vitest"

const fetchDomainRating = vi.fn()
const checkRateLimit = vi.fn()
const getRateLimitKey = vi.fn()

vi.mock("@/server/dr-providers.mjs", () => ({
  fetchDomainRating,
}))

vi.mock("@/server/rate-limit.mjs", () => ({
  checkRateLimit,
  getRateLimitKey,
}))

describe("GET /api/ahrefs/domain-rating", () => {
  beforeEach(() => {
    vi.resetModules()
    fetchDomainRating.mockReset()
    checkRateLimit.mockReset()
    getRateLimitKey.mockReset()
    getRateLimitKey.mockReturnValue("ahrefs-domain-rating:127.0.0.1")
    checkRateLimit.mockResolvedValue({ allowed: true, remaining: 29, retryAfterMs: 60000 })
  })

  it("passes Ahrefs API options through to the provider", async () => {
    fetchDomainRating.mockResolvedValue({
      target: "example.com",
      provider: "ahrefs",
      domainRating: 78,
      extra: { ahrefsRank: 1234, date: "2026-05-28" },
    })

    const { GET } = await import("./route")
    const response = await GET(
      new Request("https://dr.serp.co/api/ahrefs/domain-rating?target=example.com&provider=ahrefs&date=2026-05-28")
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(fetchDomainRating).toHaveBeenCalledWith({
      target: "example.com",
      provider: "ahrefs",
      captchaAnswer: undefined,
      captchaHash: undefined,
      date: "2026-05-28",
    })
    expect(payload).toEqual({
      target: "example.com",
      provider: "ahrefs",
      domainRating: 78,
      extra: { ahrefsRank: 1234, date: "2026-05-28" },
    })
  })

  it("rate limits before calling the provider", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterMs: 12000 })

    const { GET } = await import("./route")
    const response = await GET(
      new Request("https://dr.serp.co/api/ahrefs/domain-rating?target=example.com", {
        headers: { "cf-connecting-ip": "203.0.113.20" },
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(429)
    expect(response.headers.get("Retry-After")).toBe("12")
    expect(payload.error).toBe("Too many DR lookup requests. Please try again shortly.")
    expect(getRateLimitKey).toHaveBeenCalledWith(expect.any(Request), "ahrefs-domain-rating")
    expect(fetchDomainRating).not.toHaveBeenCalled()
  })
})
