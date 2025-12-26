import { NextResponse } from "next/server"

import { normalizeTarget } from "@/server/dr-providers.mjs"
import { clearClaimEmail, setClaimEmail } from "@/server/db.mjs"

function isValidEmail(email: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
}

export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const email = String((body as any)?.email || "").trim().toLowerCase()
  const domain = normalizeTarget(String((body as any)?.domain || ""))

  if (!isValidEmail(email) || !domain) {
    return NextResponse.json({ error: "Valid email and domain required" }, { status: 400 })
  }

  const claim = await setClaimEmail({ domain, email })
  return NextResponse.json({ ok: true, claim })
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({}))
  const email = String((body as any)?.email || "").trim().toLowerCase()
  const domain = normalizeTarget(String((body as any)?.domain || ""))

  if (!isValidEmail(email) || !domain) {
    return NextResponse.json({ error: "Valid email and domain required" }, { status: 400 })
  }

  const claim = await clearClaimEmail({ domain, email })
  return NextResponse.json({ ok: true, claim })
}
