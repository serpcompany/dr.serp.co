import { NextResponse } from "next/server"

import { readRequestJsonRecord } from "@/lib/read-json"
import { purgeInvalidSiteDomains } from "@/server/db.mjs"
import { checkAdminToken } from "@/server/admin-auth.mjs"

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

  const body = await readRequestJsonRecord(request)
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
