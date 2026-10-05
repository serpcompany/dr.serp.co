import { NextResponse } from "next/server"

import { readRequestJsonRecord } from "@/lib/read-json"
import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS, createSessionToken } from "@/server/auth-session.mjs"
import { verifyOtpToken } from "@/server/otp-token.mjs"
import { checkRateLimit } from "@/server/rate-limit.mjs"

function isValidEmail(email: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
}

export const runtime = "nodejs"
const RATE_LIMIT_POINTS = Number(process.env.VERIFY_OTP_RATE_LIMIT_POINTS ?? 10)
const RATE_LIMIT_DURATION = Number(process.env.VERIFY_OTP_RATE_LIMIT_DURATION ?? 600)

export async function POST(request: Request) {
  const body = await readRequestJsonRecord(request)
  const email = String(body?.email || "").trim().toLowerCase()
  const code = String(body?.code || "").trim()
  const token = String(body?.token || "").trim()

  if (!isValidEmail(email) || code.length !== 6 || !token) {
    return NextResponse.json({ error: "Email, code, and token required" }, { status: 400 })
  }

  // Limit guesses per email so a 6-digit code can't be brute forced within its 10-minute lifetime.
  const rate = await checkRateLimit({ key: `verify-otp:${email}`, points: RATE_LIMIT_POINTS, duration: RATE_LIMIT_DURATION })
  if (!rate.allowed) {
    const retryAfter = Math.ceil(rate.retryAfterMs / 1000)
    return NextResponse.json(
      { error: "Too many attempts. Request a new code shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    )
  }

  const secret = process.env.USESEND_OTP_SECRET || process.env.USESEND_API_KEY
  if (!secret) {
    return NextResponse.json({ error: "Missing USESEND_OTP_SECRET" }, { status: 500 })
  }

  const result = verifyOtpToken({ token, email, code, secret })
  if (!result.ok) {
    return NextResponse.json({ error: result.error || "Invalid code" }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true, email })
  response.cookies.set(SESSION_COOKIE_NAME, createSessionToken(email, { secret }), SESSION_COOKIE_OPTIONS)
  return response
}
