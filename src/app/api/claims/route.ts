import { NextResponse } from "next/server"

import { readRequestJsonRecord } from "@/lib/read-json"
import { normalizeTarget } from "@/server/dr-providers.mjs"
import { clearClaimEmail, getClaim, setClaimEmail } from "@/server/db.mjs"
import { resolveEntitlement } from "@/server/entitlements.mjs"

function isValidEmail(email: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
}

export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = await readRequestJsonRecord(request)
  const email = String(body?.email || "").trim().toLowerCase()
  const domain = normalizeTarget(String(body?.domain || ""))

  if (!isValidEmail(email) || !domain) {
    return NextResponse.json({ error: "Valid email and domain required" }, { status: 400 })
  }

  const existing = await getClaim(domain)
  const alreadyClaimedByUser =
    existing && String(existing.email ?? "").trim().toLowerCase() === email

  if (!alreadyClaimedByUser) {
    const entitlement = await resolveEntitlement({ email })
    if (!entitlement?.canClaim) {
      return NextResponse.json(
        {
          error: "Upgrade required to claim more domains.",
          code: "upgrade_required",
          entitlement,
        },
        { status: 402 }
      )
    }
  }

  const claim = await setClaimEmail({ domain, email })
  return NextResponse.json({ ok: true, claim })
}

export async function DELETE(request: Request) {
  const body = await readRequestJsonRecord(request)
  const email = String(body?.email || "").trim().toLowerCase()
  const domain = normalizeTarget(String(body?.domain || ""))

  if (!isValidEmail(email) || !domain) {
    return NextResponse.json({ error: "Valid email and domain required" }, { status: 400 })
  }

  const claim = await clearClaimEmail({ domain, email })
  return NextResponse.json({ ok: true, claim })
}
