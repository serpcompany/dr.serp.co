import { NextResponse } from "next/server"

import { readRequestJsonRecord } from "@/lib/read-json"
import { getSessionEmail } from "@/server/auth-session.mjs"
import { normalizeTarget } from "@/server/dr-providers.mjs"
import { clearClaimEmail, getClaim, setClaimEmail } from "@/server/db.mjs"
import { resolveEntitlement } from "@/server/entitlements.mjs"

export const runtime = "nodejs"

function authRequired() {
  return NextResponse.json({ error: "Sign in required.", code: "auth_required" }, { status: 401 })
}

function claimedByOther() {
  return NextResponse.json(
    { error: "This site is already claimed by another account.", code: "claimed_by_other" },
    { status: 409 }
  )
}

export async function POST(request: Request) {
  const email = getSessionEmail(request)
  if (!email) return authRequired()

  const body = await readRequestJsonRecord(request)
  const domain = normalizeTarget(String(body?.domain || ""))
  if (!domain) {
    return NextResponse.json({ error: "Valid domain required" }, { status: 400 })
  }

  const existing = await getClaim(domain)
  const existingEmail = String(existing?.email ?? "").trim().toLowerCase()
  if (existingEmail && existingEmail !== email) return claimedByOther()

  if (existingEmail !== email) {
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

  // setClaimEmail refuses to overwrite another owner, which also covers a claim racing this one.
  const claim = await setClaimEmail({ domain, email })
  if (!claim) return claimedByOther()
  return NextResponse.json({ ok: true, claim })
}

export async function DELETE(request: Request) {
  const email = getSessionEmail(request)
  if (!email) return authRequired()

  const body = await readRequestJsonRecord(request)
  const domain = normalizeTarget(String(body?.domain || ""))
  if (!domain) {
    return NextResponse.json({ error: "Valid domain required" }, { status: 400 })
  }

  const claim = await clearClaimEmail({ domain, email })
  return NextResponse.json({ ok: true, claim })
}
