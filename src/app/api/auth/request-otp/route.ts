import { NextResponse } from "next/server"

import { readRequestJsonRecord } from "@/lib/read-json"
import { createOtp } from "@/server/otp-store.mjs"
import { createOtpToken } from "@/server/otp-token.mjs"

function isValidEmail(email: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
}

export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = await readRequestJsonRecord(request)
  const email = String(body?.email || "").trim().toLowerCase()
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 })
  }

  const { ok, code, retryAfterMs, expiresAt } = await createOtp(email)
  if (!ok) {
    return NextResponse.json(
      { error: "Please wait before requesting another code", retryAfterMs },
      { status: 429 }
    )
  }

  const apiKey = process.env.USESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "Missing USESEND_API_KEY" }, { status: 500 })
  }

  const otpSecret = process.env.USESEND_OTP_SECRET || apiKey
  const from = process.env.USESEND_FROM || "DR Checker <no-reply@mail.serp.co>"

  const subject = "Your DR Checker login code"
  const html = `<p>Your DR Checker code is <strong>${code}</strong>. It expires in 10 minutes.</p>`
  const text = `Your DR Checker code is ${code}. It expires in 10 minutes.`

  const response = await fetch("https://app.usesend.com/api/v1/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to: email, from, subject, html, text }),
  })

  if (!response.ok) {
    const details = await response.text().catch(() => "")
    return NextResponse.json(
      { error: "Failed to send OTP email", details },
      { status: 502 }
    )
  }

  const token = createOtpToken({ email, code, expiresAt, secret: otpSecret })
  return NextResponse.json({ ok: true, token, expiresAt })
}
