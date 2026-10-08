import { NextResponse } from "next/server"

import { countPrunableBillingAudit, pruneBillingAudit } from "@/server/db.mjs"
import { checkAdminToken } from "@/server/admin-auth.mjs"
import { z } from "zod"
import { readWriteRequest } from "@/server/write-route"

export const runtime = "nodejs"

function parseRetentionDays(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : null
}

const PruneAuditBody = z.object({
  olderThanDays: z.number().nullable().optional(),
  dryRun: z.boolean().optional(),
})

export async function POST(request: Request) {
  const denied = checkAdminToken(request)
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status })

  // Operator scripts call admin routes with a token, not a browser cookie, so no Origin check.
  const read = await readWriteRequest(request, PruneAuditBody, { checkOrigin: false })
  if (!read.ok) return read.response
  const body = read.data
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
