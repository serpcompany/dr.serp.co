import { describe, expect, it, vi } from "vitest"

vi.mock("@/server/otp-store.mjs", () => ({
  createOtp: async () => ({ ok: false, retryAfterMs: 41500 }),
}))

describe("POST /api/auth/request-otp", () => {
  it("answers 429 with Retry-After during the resend cooldown, before sending email", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const { POST } = await import("./route")

    const response = await POST(
      new Request("http://localhost/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "user@example.com" }),
      })
    )

    expect(response.status).toBe(429)
    expect(response.headers.get("Retry-After")).toBe("42")
    expect(await response.json()).toMatchObject({ retryAfterMs: 41500 })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
