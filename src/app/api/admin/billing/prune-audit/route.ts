import { NextResponse } from "next/server"

import { readRequestJsonRecord } from "@/lib/read-json"
import { countPrunableBillingAudit, pruneBillingAudit } from "@/server/db.mjs"

export const runtime = "nodejs"

function parseRetentionDays(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : null
}

function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
}

function adminTokenFrom(request: Request) {
  const url = new URL(request.url)
  return request.headers.get("x-admin-token") || url.searchParams.get("token") || ""
}

export async function POST(request: Request) {
  const adminToken = process.env.DR_ADMIN_TOKEN
  if (!adminToken) {
    return NextResponse.json({ error: "Admin token not configured." }, { status: 500 })
  }

  if (adminTokenFrom(request) !== adminToken) return unauthorizedResponse()

  const body = await readRequestJsonRecord(request)
  const envDays = parseRetentionDays(process.env.BILLING_AUDIT_RETENTION_DAYS)
  const bodyDays = parseRetentionDays(body?.olderThanDays)
  const olderThanDays = bodyDays ?? envDays ?? 180
  const dryRun = body?.dryRun !== false

  if (dryRun) {
    const result = await countPrunableBillingAudit({ olderThanDays })
    return NextResponse.json({
      ok: true,
      dryRun: true,
      olderThanDays,
      removable: result.count,
      cutoff: result.cutoff.toISOString(),
    })
  }

  const result = await pruneBillingAudit({ olderThanDays })
  return NextResponse.json({
    ok: true,
    dryRun: false,
    olderThanDays,
    removed: result.removed,
    cutoff: result.cutoff.toISOString(),
  })
}
