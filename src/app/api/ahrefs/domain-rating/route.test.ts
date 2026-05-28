import { beforeEach, describe, expect, it, vi } from "vitest"

const fetchDomainRating = vi.fn()

vi.mock("@/server/dr-providers.mjs", () => ({
  fetchDomainRating,
}))

describe("GET /api/ahrefs/domain-rating", () => {
  beforeEach(() => {
    fetchDomainRating.mockReset()
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
})
