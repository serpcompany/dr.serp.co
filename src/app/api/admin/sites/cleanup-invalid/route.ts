import { NextResponse } from "next/server"

import { purgeInvalidSiteDomains } from "@/server/db.mjs"

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
  const adminToken = process.env.DR_ADMIN_TOKEN
  if (!adminToken) {
    return NextResponse.json({ error: "Admin token not configured." }, { status: 500 })
  }

  const url = new URL(request.url)
  const provided = request.headers.get("x-admin-token") || url.searchParams.get("token") || ""
  if (provided !== adminToken) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const dryRun = body?.dryRun !== false

  const result = await purgeInvalidSiteDomains({
    domains: KNOWN_INVALID_SITE_DOMAINS,
    dryRun,
  })

  return NextResponse.json({
    ok: true,
    ...result,
  })
}
