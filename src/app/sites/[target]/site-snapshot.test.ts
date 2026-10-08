import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const getClaim = vi.fn()
const getDrChecks = vi.fn()
const upsertClaim = vi.fn()
const recordDrCheck = vi.fn()
const recordDrHistoryChecks = vi.fn()
const setClaimSiteMetadata = vi.fn()
const resolveSitePresentation = vi.fn()
const fetchDomainRating = vi.fn()
const fetchDomainRatingHistory = vi.fn()
const checkRateLimit = vi.fn()

vi.mock("@/server/db.mjs", () => ({
  getClaim,
  getDrChecks,
  upsertClaim,
  recordDrCheck,
  recordDrHistoryChecks,
  setClaimSiteMetadata,
}))

vi.mock("@/server/site-presentation.mjs", () => ({
  resolveSitePresentation,
}))

vi.mock("@/server/rate-limit.mjs", () => ({
  RATE_LIMITER_UNAVAILABLE_MESSAGE: "This is unavailable right now. Please try again shortly.",
  checkRateLimit,
}))

vi.mock("@/server/dr-providers.mjs", async () => {
  const actual = await vi.importActual<typeof import("@/server/dr-providers.mjs")>("@/server/dr-providers.mjs")
  return {
      ...actual,
      fetchDomainRating,
      fetchDomainRatingHistory,
    }
  })

describe("loadSiteSnapshot", () => {
  beforeEach(() => {
    getClaim.mockReset()
    getDrChecks.mockReset()
    upsertClaim.mockReset()
    recordDrCheck.mockReset()
    recordDrHistoryChecks.mockReset()
    setClaimSiteMetadata.mockReset()
    resolveSitePresentation.mockReset()
    fetchDomainRating.mockReset()
    fetchDomainRatingHistory.mockReset()
    checkRateLimit.mockReset()
    checkRateLimit.mockResolvedValue({ allowed: true, remaining: 9, retryAfterMs: 0 })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("uses cached claim data without any live provider dependency", async () => {
    getDrChecks.mockResolvedValue([])
    getClaim.mockResolvedValue({
      domain: "example.com",
      domain_rating: 42,
      updated_at: "2026-04-16T00:00:00.000Z",
    })

    const { loadSiteSnapshot } = await import("./site-snapshot")
    const result = await loadSiteSnapshot("example.com")

    expect(result.domainRating).toBe(42)
    expect(result.chartPoints).toEqual([
      {
        checkedAt: "2026-04-16T00:00:00.000Z",
        domainRating: 42,
      },
    ])
    expect(result.siteTitle).toBeNull()
    expect(resolveSitePresentation).toHaveBeenCalledTimes(1)
  })

  it("falls back to 0-friendly empty state when no cached rating exists", async () => {
    getDrChecks.mockResolvedValue([])
    getClaim.mockResolvedValue({
      domain: "example.com",
      domain_rating: null,
      updated_at: "2026-04-16T00:00:00.000Z",
    })

    const { loadSiteSnapshot } = await import("./site-snapshot")
    const result = await loadSiteSnapshot("example.com")

    expect(result.domainRating).toBeNull()
    expect(result.chartPoints).toEqual([])
  })

  it("uses stored history points in chronological order and keeps the latest 24 valid points", async () => {
    const checks = Array.from({ length: 26 }, (_, index) => ({
      checked_at: new Date(Date.UTC(2024, index, 1)).toISOString(),
      domain_rating: index,
    })).reverse()

    getDrChecks.mockResolvedValue([
      { checked_at: "not-a-date", domain_rating: 99 },
      ...checks,
    ])
    getClaim.mockResolvedValue({
      domain: "example.com",
      domain_rating: null,
      updated_at: "2026-04-16T00:00:00.000Z",
    })

    const { loadSiteSnapshot } = await import("./site-snapshot")
    const result = await loadSiteSnapshot("example.com")

    expect(fetchDomainRating).not.toHaveBeenCalled()
    expect(result.domainRating).toBe(25)
    expect(result.chartPoints).toHaveLength(24)
    expect(result.chartPoints[0]).toEqual({
      checkedAt: new Date(Date.UTC(2024, 2, 1)).toISOString(),
      domainRating: 2,
    })
    expect(result.chartPoints.at(-1)).toEqual({
      checkedAt: new Date(Date.UTC(2024, 25, 1)).toISOString(),
      domainRating: 25,
    })
  })

  it("fetches and persists a DR when no cached rating exists", async () => {
    getDrChecks.mockResolvedValue([])
    getClaim.mockResolvedValue({
      domain: "example.com",
      domain_rating: null,
      updated_at: "2026-04-16T00:00:00.000Z",
    })
    fetchDomainRating.mockResolvedValue({
      domainRating: 57,
      provider: "ahrefs-api",
    })
    upsertClaim.mockResolvedValue({
      updated_at: "2026-04-16T12:00:00.000Z",
    })

    const { loadSiteSnapshot } = await import("./site-snapshot")
    const result = await loadSiteSnapshot("example.com")

    expect(fetchDomainRating).toHaveBeenCalledWith({ target: "example.com" })
    expect(upsertClaim).toHaveBeenCalledWith({
      domain: "example.com",
      domainRating: 57,
      provider: "ahrefs-api",
    })
    expect(recordDrCheck).toHaveBeenCalled()
    expect(result.domainRating).toBe(57)
    expect(result.chartPoints).toEqual([
      {
        checkedAt: "2026-04-16T12:00:00.000Z",
        domainRating: 57,
      },
    ])
  })

  it("imports Ahrefs history on first scan of a claimed domain", async () => {
    vi.stubEnv("AHREFS_API_KEY", "test-key")
    getDrChecks.mockResolvedValue([])
    getClaim.mockResolvedValue({
      domain: "example.com",
      email: "owner@example.com",
      domain_rating: null,
      updated_at: "2026-04-16T00:00:00.000Z",
    })
    fetchDomainRating.mockResolvedValue({
      domainRating: 64,
      provider: "ahrefs",
    })
    upsertClaim.mockResolvedValue({
      updated_at: "2026-04-16T12:00:00.000Z",
    })
    fetchDomainRatingHistory.mockResolvedValue({
      provider: "ahrefs-history",
      points: [
        { checkedAt: "2026-02-01", domainRating: 58 },
        { checkedAt: "2026-03-01", domainRating: 61 },
      ],
    })
    recordDrHistoryChecks.mockResolvedValue([
      { checked_at: "2026-02-01T00:00:00.000Z", domain_rating: 58 },
      { checked_at: "2026-03-01T00:00:00.000Z", domain_rating: 61 },
    ])

    const { loadSiteSnapshot } = await import("./site-snapshot")
    const result = await loadSiteSnapshot("example.com")

    expect(fetchDomainRatingHistory).toHaveBeenCalledWith({ target: "example.com" })
    expect(recordDrHistoryChecks).toHaveBeenCalledWith({
      domain: "example.com",
      provider: "ahrefs-history",
      points: [
        { checkedAt: "2026-02-01", domainRating: 58 },
        { checkedAt: "2026-03-01", domainRating: 61 },
      ],
    })
    expect(result.chartPoints).toEqual([
      { checkedAt: "2026-02-01T00:00:00.000Z", domainRating: 58 },
      { checkedAt: "2026-03-01T00:00:00.000Z", domainRating: 61 },
      { checkedAt: "2026-04-16T12:00:00.000Z", domainRating: 64 },
    ])
    expect(result.lastCheckedAt).toBe("2026-04-16T12:00:00.000Z")
  })

  it("skips the paid Ahrefs history import for unclaimed domains", async () => {
    vi.stubEnv("AHREFS_API_KEY", "test-key")
    getDrChecks.mockResolvedValue([])
    getClaim.mockResolvedValue(null)
    fetchDomainRating.mockResolvedValue({
      domainRating: 64,
      provider: "ahrefs",
    })
    upsertClaim.mockResolvedValue({
      updated_at: "2026-04-16T12:00:00.000Z",
    })

    const { loadSiteSnapshot } = await import("./site-snapshot")
    const result = await loadSiteSnapshot("example.com")

    expect(fetchDomainRating).toHaveBeenCalledWith({ target: "example.com" })
    expect(fetchDomainRatingHistory).not.toHaveBeenCalled()
    expect(recordDrHistoryChecks).not.toHaveBeenCalled()
    expect(result.domainRating).toBe(64)
  })

  it("skips the first lookup for a site caught by its spam title", async () => {
    getDrChecks.mockResolvedValue([])
    getClaim.mockResolvedValue(null)
    resolveSitePresentation.mockResolvedValue({ siteTitle: "Situs Slot Gacor Terpercaya" })
    setClaimSiteMetadata.mockResolvedValue({ site_title: "Situs Slot Gacor Terpercaya" })

    const { loadSiteSnapshot } = await import("./site-snapshot")
    const result = await loadSiteSnapshot("example.com")

    // The metadata fetch that reveals the title counts against the caps; the lookup never runs.
    expect(checkRateLimit).toHaveBeenCalled()
    expect(fetchDomainRating).not.toHaveBeenCalled()
    expect(upsertClaim).not.toHaveBeenCalled()
    expect(result.domainRating).toBeNull()
    expect(result.siteTitle).toBe("Situs Slot Gacor Terpercaya")
  })

  it("skips the first lookup for a site whose stored title is spam", async () => {
    getDrChecks.mockResolvedValue([])
    getClaim.mockResolvedValue({
      domain: "example.com",
      domain_rating: null,
      site_title: "Online Casino Reviews",
      meta_description: "Reviews",
      site_url: "https://example.com",
    })

    const { loadSiteSnapshot } = await import("./site-snapshot")
    await loadSiteSnapshot("example.com")

    expect(checkRateLimit).not.toHaveBeenCalled()
    expect(resolveSitePresentation).not.toHaveBeenCalled()
    expect(fetchDomainRating).not.toHaveBeenCalled()
  })

  it("fetches no metadata and stores no row for a first visit over the cap", async () => {
    getDrChecks.mockResolvedValue([])
    getClaim.mockResolvedValue(null)
    checkRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterMs: 60000 })

    const { loadSiteSnapshot } = await import("./site-snapshot")
    const result = await loadSiteSnapshot("example.com", { rateLimitKey: "new-site-lookup:203.0.113.7" })

    expect(resolveSitePresentation).not.toHaveBeenCalled()
    expect(setClaimSiteMetadata).not.toHaveBeenCalled()
    expect(fetchDomainRating).not.toHaveBeenCalled()
    expect(result.lookupError).toBe("Too many new site lookups right now. Please try again later.")
  })

  it("rate limits new site lookups per client before calling the provider", async () => {
    getDrChecks.mockResolvedValue([])
    getClaim.mockResolvedValue(null)
    checkRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterMs: 60000 })

    const { loadSiteSnapshot } = await import("./site-snapshot")
    const result = await loadSiteSnapshot("example.com", { rateLimitKey: "new-site-lookup:203.0.113.7" })

    expect(checkRateLimit).toHaveBeenCalledTimes(1)
    expect(checkRateLimit).toHaveBeenCalledWith(expect.objectContaining({ key: "new-site-lookup:203.0.113.7" }))
    expect(fetchDomainRating).not.toHaveBeenCalled()
    expect(result.domainRating).toBeNull()
    expect(result.lookupError).toBe("Too many new site lookups right now. Please try again later.")
  })

  it("stops new site lookups once the global daily cap is reached", async () => {
    getDrChecks.mockResolvedValue([])
    getClaim.mockResolvedValue(null)
    checkRateLimit
      .mockResolvedValueOnce({ allowed: true, remaining: 9, retryAfterMs: 0 })
      .mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterMs: 60000 })

    const { loadSiteSnapshot } = await import("./site-snapshot")
    const result = await loadSiteSnapshot("example.com", { rateLimitKey: "new-site-lookup:203.0.113.7" })

    expect(checkRateLimit).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: "new-site-lookup:global", duration: 86400 })
    )
    expect(fetchDomainRating).not.toHaveBeenCalled()
    expect(result.lookupError).toBe("Too many new site lookups right now. Please try again later.")
  })

  it("does not spend rate limit points when a cached rating exists", async () => {
    getDrChecks.mockResolvedValue([])
    getClaim.mockResolvedValue({
      domain: "example.com",
      domain_rating: 42,
      updated_at: "2026-04-16T00:00:00.000Z",
    })

    const { loadSiteSnapshot } = await import("./site-snapshot")
    await loadSiteSnapshot("example.com")

    expect(checkRateLimit).not.toHaveBeenCalled()
    expect(fetchDomainRating).not.toHaveBeenCalled()
  })

  it("does not surface raw provider errors when no cached rating exists", async () => {
    getDrChecks.mockResolvedValue([])
    getClaim.mockResolvedValue({
      domain: "example.com",
      domain_rating: null,
      updated_at: "2026-04-16T00:00:00.000Z",
    })
    fetchDomainRating.mockRejectedValue(new Error("AHREFS_API_KEY env var not set"))

    const { loadSiteSnapshot } = await import("./site-snapshot")
    const result = await loadSiteSnapshot("example.com")

    expect(result.domainRating).toBeNull()
    expect(result.chartPoints).toEqual([])
    expect(result.lookupError).toBeNull()
  })

  it("says lookups are unavailable, not over the cap, when the rate limiter is down", async () => {
    getDrChecks.mockResolvedValue([])
    getClaim.mockResolvedValue(null)
    checkRateLimit.mockResolvedValueOnce({ allowed: false, unavailable: true, remaining: 0, retryAfterMs: 60000 })

    const { loadSiteSnapshot } = await import("./site-snapshot")
    const result = await loadSiteSnapshot("example.com")

    expect(fetchDomainRating).not.toHaveBeenCalled()
    expect(resolveSitePresentation).not.toHaveBeenCalled()
    expect(result.lookupError).toBe("New site lookups are unavailable right now. Please try again shortly.")
  })
})
