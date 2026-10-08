import { NextResponse } from "next/server"

import { readRequestJsonRecord } from "@/lib/read-json"
import { countPrunableBillingAudit, pruneBillingAudit } from "@/server/db.mjs"
import { checkAdminToken } from "@/server/admin-auth.mjs"

export const runtime = "nodejs"

function parseRetentionDays(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : null
}

export async function POST(request: Request) {
  const denied = checkAdminToken(request)
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status })

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
