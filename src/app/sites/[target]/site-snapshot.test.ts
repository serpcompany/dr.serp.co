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
      provider: "frogdr",
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
      provider: "frogdr",
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

  it("imports Ahrefs history on first scan when the Ahrefs API is available", async () => {
    vi.stubEnv("AHREFS_API_KEY", "test-key")
    getDrChecks.mockResolvedValue([])
    getClaim.mockResolvedValue({
      domain: "example.com",
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

  it("surfaces lookup errors when no cached rating exists", async () => {
    getDrChecks.mockResolvedValue([])
    getClaim.mockResolvedValue({
      domain: "example.com",
      domain_rating: null,
      updated_at: "2026-04-16T00:00:00.000Z",
    })
    fetchDomainRating.mockRejectedValue(new Error("FROGDR_SESSION is invalid or expired"))

    const { loadSiteSnapshot } = await import("./site-snapshot")
    const result = await loadSiteSnapshot("example.com")

    expect(result.domainRating).toBeNull()
    expect(result.chartPoints).toEqual([])
    expect(result.lookupError).toBe("FROGDR_SESSION is invalid or expired")
  })
})
