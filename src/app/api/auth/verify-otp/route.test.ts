import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getSessionEmail } from "@/server/auth-session.mjs"
import { createOtpToken } from "@/server/otp-token.mjs"

const checkRateLimit = vi.fn()

vi.mock("@/server/rate-limit.mjs", () => ({
  RATE_LIMITER_UNAVAILABLE_MESSAGE: "This is unavailable right now. Please try again shortly.",
  checkRateLimit,
}))

function verifyRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/auth/verify-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/auth/verify-otp", () => {
  const token = () =>
    createOtpToken({ email: "user@example.com", code: "482913", expiresAt: Date.now() + 60000, secret: "test-secret" })

  beforeEach(() => {
    vi.stubEnv("USESEND_OTP_SECRET", "test-secret")
    checkRateLimit.mockReset()
    checkRateLimit.mockResolvedValue({ allowed: true, remaining: 9, retryAfterMs: 0 })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("sets an HttpOnly session cookie for the verified email", async () => {
    const { POST } = await import("./route")
    const response = await POST(verifyRequest({ email: "user@example.com", code: "482913", token: token() }))
    const setCookie = response.headers.get("set-cookie") ?? ""

    expect(response.status).toBe(200)
    expect(setCookie).toMatch(/^dr_session=/)
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/Secure/i)
    expect(getSessionEmail({ headers: new Headers({ cookie: setCookie.split(";")[0] }) })).toBe("user@example.com")
  })

  it("rejects a wrong code without setting a session", async () => {
    const { POST } = await import("./route")
    const response = await POST(verifyRequest({ email: "user@example.com", code: "000000", token: token() }))

    expect(response.status).toBe(401)
    expect(response.headers.get("set-cookie")).toBeNull()
  })

  it("rate limits guesses per email", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterMs: 120000 })

    const { POST } = await import("./route")
    const response = await POST(verifyRequest({ email: "user@example.com", code: "482913", token: token() }))

    expect(response.status).toBe(429)
    expect(checkRateLimit).toHaveBeenCalledWith(expect.objectContaining({ key: "verify-otp:user@example.com" }))
    expect(response.headers.get("set-cookie")).toBeNull()
  })

  it("names no env var when the OTP secret is missing", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubEnv("USESEND_OTP_SECRET", "")
    vi.stubEnv("USESEND_API_KEY", "")
    const { POST } = await import("./route")

    const response = await POST(verifyRequest({ email: "user@example.com", code: "482913", token: token() }))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "Sign-in is unavailable right now. Please try again later." })
    expect(consoleError).toHaveBeenCalledWith("auth.verify-otp: USESEND_OTP_SECRET and USESEND_API_KEY are not set")
  })
})
