import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const createOtp = vi.hoisted(() => vi.fn())

vi.mock("@/server/otp-store.mjs", () => ({ createOtp }))

function otpRequest() {
  return new Request("http://localhost/api/auth/request-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify({ email: "user@example.com" }),
  })
}

describe("POST /api/auth/request-otp", () => {
  beforeEach(() => {
    createOtp.mockReset()
    createOtp.mockResolvedValue({ ok: true, code: "482913", expiresAt: Date.now() + 600000 })
    vi.stubEnv("USESEND_API_KEY", "us_test_key")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("answers 429 with Retry-After during the resend cooldown, before sending email", async () => {
    createOtp.mockResolvedValue({ ok: false, retryAfterMs: 41500 })
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const { POST } = await import("./route")

    const response = await POST(otpRequest())

    expect(response.status).toBe(429)
    expect(response.headers.get("Retry-After")).toBe("42")
    expect(await response.json()).toMatchObject({ retryAfterMs: 41500 })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("names no env var when the useSend key is missing", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubEnv("USESEND_API_KEY", "")
    const { POST } = await import("./route")

    const response = await POST(otpRequest())

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "Sign-in is unavailable right now. Please try again later." })
    expect(consoleError).toHaveBeenCalledWith("auth.request-otp: USESEND_API_KEY is not set")
  })

  it("logs useSend's refusal and returns no details", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"error":"domain mail.serp.co not verified"}', { status: 403 }))
    const { POST } = await import("./route")

    const response = await POST(otpRequest())

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: "Failed to send OTP email" })
    expect(consoleError).toHaveBeenCalledWith("auth.request-otp: useSend refused the email", {
      status: 403,
      details: '{"error":"domain mail.serp.co not verified"}',
    })
  })
})
