import { NextResponse } from "next/server"

import { readRequestJsonRecord } from "@/lib/read-json"
import { resolveEntitlement } from "@/server/entitlements.mjs"

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

  const entitlement = await resolveEntitlement({ email })

  return NextResponse.json({ ok: true, entitlement })
}
