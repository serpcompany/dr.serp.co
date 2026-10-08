import { NextResponse } from "next/server"

import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS, createSessionToken } from "@/server/auth-session.mjs"
import { verifyOtpToken } from "@/server/otp-token.mjs"
import { RATE_LIMITER_UNAVAILABLE_MESSAGE, checkRateLimit } from "@/server/rate-limit.mjs"
import { readWriteRequest } from "@/server/write-route"
import { VerifyOtpBody } from "@/server/write-schemas"
import { readNumberEnv } from "@/lib/env"

function isValidEmail(email: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
}

export const runtime = "nodejs"

export async function POST(request: Request) {
  const read = await readWriteRequest(request, VerifyOtpBody)
  if (!read.ok) return read.response

  const email = read.data.email.trim().toLowerCase()
  const code = read.data.code.trim()
  const token = read.data.token.trim()

  if (!isValidEmail(email) || code.length !== 6 || !token) {
    return NextResponse.json({ error: "Email, code, and token required" }, { status: 400 })
  }

  // Limit guesses per email so a 6-digit code can't be brute forced within its 10-minute lifetime.
  const rate = await checkRateLimit({
    key: `verify-otp:${email}`,
    points: readNumberEnv("VERIFY_OTP_RATE_LIMIT_POINTS", 10),
    duration: readNumberEnv("VERIFY_OTP_RATE_LIMIT_DURATION", 600),
  })
  if (rate.unavailable) {
    return NextResponse.json({ error: RATE_LIMITER_UNAVAILABLE_MESSAGE }, { status: 503 })
  }
  if (!rate.allowed) {
    const retryAfter = Math.ceil(rate.retryAfterMs / 1000)
    return NextResponse.json(
      { error: "Too many attempts. Request a new code shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    )
  }

  const secret = process.env.USESEND_OTP_SECRET || process.env.USESEND_API_KEY
  if (!secret) {
    console.error("auth.verify-otp: USESEND_OTP_SECRET and USESEND_API_KEY are not set")
    return NextResponse.json({ error: "Sign-in is unavailable right now. Please try again later." }, { status: 500 })
  }

  const result = verifyOtpToken({ token, email, code, secret })
  if (!result.ok) {
    return NextResponse.json({ error: result.error || "Invalid code" }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true, email })
  response.cookies.set(SESSION_COOKIE_NAME, createSessionToken(email, { secret }), SESSION_COOKIE_OPTIONS)
  return response
}
