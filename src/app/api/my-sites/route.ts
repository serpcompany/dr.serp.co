import { NextResponse } from "next/server"

import { countClaimsByEmail, listClaimsByEmail } from "@/server/db.mjs"
import { resolveEntitlement } from "@/server/entitlements.mjs"

export const runtime = "nodejs"

function isValidEmail(email: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const email = String((body as any)?.email || "")
    .trim()
    .toLowerCase()
  const query = String((body as any)?.query || "").trim()
  const limitRaw = Number((body as any)?.limit)
  const offsetRaw = Number((body as any)?.offset)

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 })
  }

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
