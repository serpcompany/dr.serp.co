import { NextResponse } from "next/server"

import { verifyOtpToken } from "@/server/otp-token.mjs"

function isValidEmail(email: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
}

export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const email = String((body as any)?.email || "").trim().toLowerCase()
  const code = String((body as any)?.code || "").trim()
  const token = String((body as any)?.token || "").trim()

  if (!isValidEmail(email) || code.length !== 6 || !token) {
    return NextResponse.json({ error: "Email, code, and token required" }, { status: 400 })
  }

  const secret = process.env.USESEND_OTP_SECRET || process.env.USESEND_API_KEY
  if (!secret) {
    return NextResponse.json({ error: "Missing USESEND_OTP_SECRET" }, { status: 500 })
  }

  const result = verifyOtpToken({ token, secret })
  if (!result.ok) {
    return NextResponse.json({ error: result.error || "Invalid token" }, { status: 401 })
  }

  const payload = result.payload
  if (payload.email !== email || payload.code !== code) {
    return NextResponse.json({ error: "Invalid code" }, { status: 401 })
  }

  return NextResponse.json({ ok: true })
}
