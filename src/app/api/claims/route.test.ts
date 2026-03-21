import { beforeEach, describe, expect, it, vi } from "vitest"

const getClaim = vi.fn()
const setClaimEmail = vi.fn()
const clearClaimEmail = vi.fn()
const resolveEntitlement = vi.fn()

vi.mock("@/server/db.mjs", () => ({
  getClaim,
  setClaimEmail,
  clearClaimEmail,
}))

vi.mock("@/server/entitlements.mjs", () => ({
  resolveEntitlement,
}))

describe("POST /api/claims", () => {
  beforeEach(() => {
    getClaim.mockReset()
    setClaimEmail.mockReset()
    resolveEntitlement.mockReset()
  })

  it("blocks claims when entitlement limit is exceeded", async () => {
    getClaim.mockResolvedValue(null)
    resolveEntitlement.mockResolvedValue({ canClaim: false, domainsLimit: 0, domainsUsed: 0 })

    const { POST } = await import("./route")
    const request = new Request("http://localhost/api/claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", domain: "example.com" }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(402)
    expect(payload.code).toBe("upgrade_required")
    expect(setClaimEmail).not.toHaveBeenCalled()
  })
})
