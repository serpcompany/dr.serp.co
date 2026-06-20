import { beforeEach, describe, expect, it, vi } from "vitest"

const fetchDomainRating = vi.fn()
const fetchDomainRatingHistory = vi.fn()
const getClaim = vi.fn()
const getDrChecks = vi.fn()
const recordDrCheck = vi.fn()
const recordDrHistoryChecks = vi.fn()
const upsertClaim = vi.fn()
const checkRateLimit = vi.fn()
const getRateLimitKey = vi.fn()
const resolveEntitlement = vi.fn()

vi.mock("@/server/db.mjs", () => ({
  getClaim,
  getDrChecks,
  recordDrCheck,
  recordDrHistoryChecks,
  upsertClaim,
}))

vi.mock("@/server/entitlements.mjs", () => ({
  resolveEntitlement,
}))

vi.mock("@/server/rate-limit.mjs", () => ({
  checkRateLimit,
  getRateLimitKey,
}))

vi.mock("@/server/dr-providers.mjs", async () => {
  const actual = await vi.importActual<typeof import("@/server/dr-providers.mjs")>("@/server/dr-providers.mjs")
  return {
    ...actual,
    fetchDomainRating,
    fetchDomainRatingHistory,
  }
})

describe("POST /api/recheck", () => {
  beforeEach(() => {
    vi.resetModules()
    fetchDomainRating.mockReset()
    fetchDomainRatingHistory.mockReset()
    getClaim.mockReset()
    getDrChecks.mockReset()
    recordDrCheck.mockReset()
    recordDrHistoryChecks.mockReset()
    upsertClaim.mockReset()
    checkRateLimit.mockReset()
    getRateLimitKey.mockReset()
    resolveEntitlement.mockReset()
    getRateLimitKey.mockReturnValue("dr-recheck:127.0.0.1")
    checkRateLimit.mockResolvedValue({ allowed: true, remaining: 9, retryAfterMs: 60000 })
    getClaim.mockResolvedValue(null)
    getDrChecks.mockResolvedValue([])
    resolveEntitlement.mockResolvedValue(null)
    vi.useRealTimers()
  })

  it("rejects invalid domains before any provider call", async () => {
    const { POST } = await import("./route")
    const request = new Request("http://localhost/api/recheck", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "phpinfo.php" }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe("Valid domain required")
    expect(fetchDomainRating).not.toHaveBeenCalled()
    expect(upsertClaim).not.toHaveBeenCalled()
    expect(recordDrCheck).not.toHaveBeenCalled()
    expect(fetchDomainRatingHistory).not.toHaveBeenCalled()
    expect(recordDrHistoryChecks).not.toHaveBeenCalled()
  })

  it("rate limits valid recheck requests before provider calls", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterMs: 9000 })

    const { POST } = await import("./route")
    const request = new Request("http://localhost/api/recheck", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "example.com" }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(429)
    expect(response.headers.get("Retry-After")).toBe("9")
    expect(payload.error).toBe("Too many recheck requests. Please try again shortly.")
    expect(getRateLimitKey).toHaveBeenCalledWith(request, "dr-recheck")
    expect(fetchDomainRating).not.toHaveBeenCalled()
    expect(fetchDomainRatingHistory).not.toHaveBeenCalled()
  })

  it("blocks free rechecks before the monthly cadence allows another provider call", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-20T00:00:00.000Z"))
    getDrChecks.mockResolvedValue([{ checked_at: "2026-06-01T00:00:00.000Z", domain_rating: 70 }])

    const { POST } = await import("./route")
    const request = new Request("http://localhost/api/recheck", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "example.com" }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(429)
    expect(response.headers.get("Retry-After")).toBe(String(11 * 24 * 60 * 60))
    expect(payload).toMatchObject({
      error: "Free domains can be rechecked once every 30 days.",
      intervalDays: 30,
      tier: "free",
      nextAllowedAt: "2026-07-01T00:00:00.000Z",
    })
    expect(fetchDomainRating).not.toHaveBeenCalled()
    expect(fetchDomainRatingHistory).not.toHaveBeenCalled()
  })

  it("blocks paid claimed domains before the weekly cadence allows another provider call", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-20T00:00:00.000Z"))
    getClaim.mockResolvedValue({ domain: "example.com", email: "paid@example.com" })
    getDrChecks.mockResolvedValue([{ checked_at: "2026-06-16T00:00:00.000Z", domain_rating: 70 }])
    resolveEntitlement.mockResolvedValue({ canAccessPaidFeatures: true })

    const { POST } = await import("./route")
    const request = new Request("http://localhost/api/recheck", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "example.com" }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(429)
    expect(response.headers.get("Retry-After")).toBe(String(3 * 24 * 60 * 60))
    expect(payload).toMatchObject({
      error: "Paid domains can be rechecked once every 7 days.",
      intervalDays: 7,
      tier: "paid",
      nextAllowedAt: "2026-06-23T00:00:00.000Z",
    })
    expect(resolveEntitlement).toHaveBeenCalledWith({ email: "paid@example.com" })
    expect(fetchDomainRating).not.toHaveBeenCalled()
    expect(fetchDomainRatingHistory).not.toHaveBeenCalled()
  })

  it("records Ahrefs monthly history after a successful recheck", async () => {
    fetchDomainRating.mockResolvedValue({
      target: "example.com",
      provider: "ahrefs",
      domainRating: 72.9,
    })
    upsertClaim.mockResolvedValue({
      updated_at: "2026-05-28T12:00:00.000Z",
    })
    recordDrCheck.mockResolvedValue({
      id: 1,
      domain: "example.com",
      domain_rating: 72,
      provider: "ahrefs",
      checked_at: "2026-05-28T12:00:00.000Z",
    })
    fetchDomainRatingHistory.mockResolvedValue({
      provider: "ahrefs-history",
      target: "example.com",
      points: [
        { checkedAt: "2024-05-28", domainRating: 61.2 },
        { checkedAt: "2024-06-28", domainRating: 62 },
      ],
    })
    recordDrHistoryChecks.mockResolvedValue([{ id: 2 }, { id: 3 }])

    const { POST } = await import("./route")
    const request = new Request("http://localhost/api/recheck", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "https://www.Example.com/path?q=1" }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(fetchDomainRating).toHaveBeenCalledWith({ target: "example.com" })
    expect(upsertClaim).toHaveBeenCalledWith({
      domain: "example.com",
      domainRating: 72,
      provider: "ahrefs",
    })
    expect(recordDrCheck).toHaveBeenCalledWith({
      domain: "example.com",
      domainRating: 72,
      provider: "ahrefs",
      checkedAt: new Date("2026-05-28T12:00:00.000Z"),
    })
    expect(fetchDomainRatingHistory).toHaveBeenCalledWith({ target: "example.com" })
    expect(recordDrHistoryChecks).toHaveBeenCalledWith({
      domain: "example.com",
      provider: "ahrefs-history",
      points: [
        { checkedAt: "2024-05-28", domainRating: 61.2 },
        { checkedAt: "2024-06-28", domainRating: 62 },
      ],
    })
    expect(payload).toEqual({
      ok: true,
      domain: "example.com",
      domainRating: 72,
      provider: "ahrefs",
      checkedAt: "2026-05-28T12:00:00.000Z",
      nextAllowedAt: "2026-06-27T12:00:00.000Z",
      intervalDays: 30,
      tier: "free",
      historyPointCount: 2,
    })
  })
})
