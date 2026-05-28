import { beforeEach, describe, expect, it, vi } from "vitest"

const fetchDomainRating = vi.fn()
const fetchDomainRatingHistory = vi.fn()
const getClaim = vi.fn()
const recordDrCheck = vi.fn()
const recordDrHistoryChecks = vi.fn()
const upsertClaim = vi.fn()

vi.mock("@/server/db.mjs", () => ({
  getClaim,
  recordDrCheck,
  recordDrHistoryChecks,
  upsertClaim,
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
    fetchDomainRating.mockReset()
    fetchDomainRatingHistory.mockReset()
    getClaim.mockReset()
    recordDrCheck.mockReset()
    recordDrHistoryChecks.mockReset()
    upsertClaim.mockReset()
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
      historyPointCount: 2,
    })
  })
})
