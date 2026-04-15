import { beforeEach, describe, expect, it, vi } from "vitest"

const fetchDomainRating = vi.fn()
const getClaim = vi.fn()
const recordDrCheck = vi.fn()
const upsertClaim = vi.fn()

vi.mock("@/server/db.mjs", () => ({
  getClaim,
  recordDrCheck,
  upsertClaim,
}))

vi.mock("@/server/dr-providers.mjs", async () => {
  const actual = await vi.importActual<typeof import("@/server/dr-providers.mjs")>("@/server/dr-providers.mjs")
  return {
    ...actual,
    fetchDomainRating,
  }
})

describe("POST /api/recheck", () => {
  beforeEach(() => {
    fetchDomainRating.mockReset()
    getClaim.mockReset()
    recordDrCheck.mockReset()
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
  })
})
