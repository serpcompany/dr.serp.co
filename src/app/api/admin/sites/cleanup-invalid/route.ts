import { NextResponse } from "next/server"

import { purgeInvalidSiteDomains } from "@/server/db.mjs"
import { checkAdminToken } from "@/server/admin-auth.mjs"
import { readWriteRequest } from "@/server/write-route"
import { CleanupBody } from "@/server/write-schemas"

export const runtime = "nodejs"

const KNOWN_INVALID_SITE_DOMAINS = [
  "test.php",
  "phpinfo.php",
  "wp-login.php",
  "xmlrpc.php",
  "wp-json",
  "contact",
  "demo",
  "pricing",
  "ftp-config.json",
  "get-in-touch",
  "help",
  ".env.production",
  ".env.save",
  ".remote",
  "backup.sql",
  ".env",
  "support",
  ".env.sample",
  "wp",
  ".env.local",
  "wordpress",
  "database.sql",
]

export async function POST(request: Request) {
  const denied = checkAdminToken(request)
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status })

  // Operator scripts call admin routes with a token, not a browser cookie, so no Origin check.
  const read = await readWriteRequest(request, CleanupBody, { checkOrigin: false })
  if (!read.ok) return read.response
  const body = read.data
  const dryRun = body?.dryRun !== false
  const scanAll = body?.scanAll === true

  const result = await purgeInvalidSiteDomains({
    domains: scanAll ? undefined : KNOWN_INVALID_SITE_DOMAINS,
    dryRun,
  })

  return NextResponse.json({
    ok: true,
    ...result,
  })
}
