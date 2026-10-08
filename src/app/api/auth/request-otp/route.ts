import { NextResponse } from "next/server"

import { createOtp } from "@/server/otp-store.mjs"
import { createOtpToken } from "@/server/otp-token.mjs"
import { readWriteRequest } from "@/server/write-route"
import { RequestOtpBody } from "@/server/write-schemas"

function isValidEmail(email: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
}

export const runtime = "nodejs"

export async function POST(request: Request) {
  const read = await readWriteRequest(request, RequestOtpBody)
  if (!read.ok) return read.response

  const email = read.data.email.trim().toLowerCase()
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 })
  }

  const { ok, code, retryAfterMs, expiresAt } = await createOtp(email)
  if (!ok) {
    return NextResponse.json(
      { error: "Please wait before requesting another code", retryAfterMs },
      { status: 429, headers: { "Retry-After": String(Math.ceil((retryAfterMs ?? 0) / 1000)) } }
    )
  }

  const apiKey = process.env.USESEND_API_KEY
  if (!apiKey) {
    // Config and useSend errors stay in the log; the visitor sees a fixed message.
    console.error("auth.request-otp: USESEND_API_KEY is not set")
    return NextResponse.json({ error: "Sign-in is unavailable right now. Please try again later." }, { status: 500 })
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
    console.error("auth.request-otp: useSend refused the email", { status: response.status, details })
    return NextResponse.json({ error: "Failed to send OTP email" }, { status: 502 })
  }

  const token = createOtpToken({ email, code, expiresAt, secret: otpSecret })
  return NextResponse.json({ ok: true, token, expiresAt })
}
