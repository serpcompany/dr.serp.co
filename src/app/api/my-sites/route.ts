import { NextResponse } from "next/server"

import { readRequestJsonRecord } from "@/lib/read-json"
import { getSessionEmail } from "@/server/auth-session.mjs"
import { countClaimsByEmail, listClaimsByEmail } from "@/server/db.mjs"
import { resolveEntitlement } from "@/server/entitlements.mjs"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const email = getSessionEmail(request)
  if (!email) {
    return NextResponse.json({ error: "Sign in required.", code: "auth_required" }, { status: 401 })
  }

  const body = await readRequestJsonRecord(request)
  const query = String(body?.query || "").trim()
  const limitRaw = Number(body?.limit)
  const offsetRaw = Number(body?.offset)

  const entitlement = await resolveEntitlement({ email })
  if (!entitlement?.canAccessPaidFeatures) {
    return NextResponse.json({
      ok: false,
      error: "Upgrade required to manage monitored domains.",
      code: "upgrade_required",
      entitlement,
    })
  }

  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.floor(limitRaw))) : 12
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0

  const [total, sites] = await Promise.all([
    countClaimsByEmail({ email, query }),
    listClaimsByEmail({ email, query, limit, offset, sort: "updated" }),
  ])

  return NextResponse.json({ ok: true, total, sites })
}
