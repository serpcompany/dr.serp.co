import { beforeEach, describe, expect, it, vi } from "vitest"

const fetchDomainRating = vi.fn()
const normalizeTarget = vi.fn((target?: string) => target ?? null)
const getClaim = vi.fn()
const getDrChecks = vi.fn()
const recordDrCheck = vi.fn()
const upsertClaim = vi.fn()

vi.mock("@/server/dr-providers.mjs", () => ({
  fetchDomainRating,
  normalizeTarget,
}))

vi.mock("@/server/db.mjs", () => ({
  getClaim,
  getDrChecks,
  recordDrCheck,
  upsertClaim,
}))

async function requestBadge(url: string) {
  const { GET } = await import("./route")
  const response = await GET(new Request(url), {
    params: Promise.resolve({ target: "example.com" }),
  })
  return {
    response,
    svg: await response.text(),
  }
}

describe("GET /badge/[target]", () => {
  beforeEach(() => {
    fetchDomainRating.mockReset()
    normalizeTarget.mockReset()
    getClaim.mockReset()
    getDrChecks.mockReset()
    recordDrCheck.mockReset()
    upsertClaim.mockReset()
    normalizeTarget.mockImplementation((target?: string) => target ?? null)
  })

  it("uses serp-dr-v3 style by default", async () => {
    const { response, svg } = await requestBadge("http://localhost/badge/example.com?dr=24")

    expect(response.status).toBe(200)
    expect(svg).toContain("__DR_DASHARRAY__".replace("__DR_DASHARRAY__", "16.34 51.73") ? "stroke-dasharray" : "stroke-dasharray")
    expect(svg).toContain(">24<")
    expect(svg).toContain("SERP DR")
  })

  it("supports verified style via style query param (now serves v3)", async () => {
    const { svg } = await requestBadge("http://localhost/badge/example.com?style=verified&dr=24")

    expect(svg).toContain(">24<")
    expect(svg).toContain("SERP DR")
  })

  it("supports badge1 as alias (now serves v3)", async () => {
    const { svg } = await requestBadge("http://localhost/badge/example.com?style=badge1&dr=24")

    expect(svg).toContain(">24<")
    expect(svg).toContain("SERP DR")
  })

  it("falls back to v3 for unknown styles", async () => {
    const { svg } = await requestBadge("http://localhost/badge/example.com?style=unknown&dr=24")

    expect(svg).toContain(">24<")
    expect(svg).toContain("SERP DR")
  })

  it("sanitizes invalid dr overrides to ??", async () => {
    const { svg } = await requestBadge("http://localhost/badge/example.com?dr=not-a-number")

    expect(svg).toContain(">0<")
  })

  it("falls back to unknown when no cached rating exists", async () => {
    getClaim.mockResolvedValue(null)
    getDrChecks.mockResolvedValue([])

    const { response, svg } = await requestBadge("http://localhost/badge/example.com")

    expect(response.status).toBe(200)
    expect(svg).toContain(">?<")
    expect(fetchDomainRating).not.toHaveBeenCalled()
  })
})
