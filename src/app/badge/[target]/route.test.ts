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

  it("uses improved style by default", async () => {
    const { response, svg } = await requestBadge("http://localhost/badge/example.com?dr=24")

    expect(response.status).toBe(200)
    expect(svg).toContain('<circle cx="32"')
    expect(svg).not.toContain('id="verified"')
  })

  it("supports verified style via style query param", async () => {
    const { svg } = await requestBadge("http://localhost/badge/example.com?style=verified&dr=24")

    expect(svg).toContain('id="verified"')
    expect(svg).toContain(">24<")
  })

  it("supports badge1 as alias for verified", async () => {
    const { svg } = await requestBadge("http://localhost/badge/example.com?style=badge1&dr=24")

    expect(svg).toContain('id="verified"')
  })

  it("falls back to improved style for unknown styles", async () => {
    const { svg } = await requestBadge("http://localhost/badge/example.com?style=unknown&dr=24")

    expect(svg).toContain('<circle cx="32"')
    expect(svg).not.toContain('id="verified"')
  })

  it("sanitizes invalid dr overrides to ??", async () => {
    const { svg } = await requestBadge("http://localhost/badge/example.com?dr=not-a-number")

    expect(svg).toContain(">??<")
  })
})
