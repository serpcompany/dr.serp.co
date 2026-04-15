import { beforeEach, describe, expect, it, vi } from "vitest"

const getClaim = vi.fn()
const getDrChecks = vi.fn()

vi.mock("@/server/db.mjs", () => ({
  getClaim,
  getDrChecks,
}))

describe("loadSiteSnapshot", () => {
  beforeEach(() => {
    getClaim.mockReset()
    getDrChecks.mockReset()
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
})
