import { neon } from "@neondatabase/serverless"

import { loadProjectEnv, getDatabaseConnectionString } from "./_load-env.mjs"
import { isValidDomainTarget } from "../src/server/domain-target.mjs"
import { resolveSitePresentation } from "../src/server/site-presentation.mjs"

loadProjectEnv()

const connectionString = getDatabaseConnectionString()
if (!connectionString) {
  throw new Error("No database connection string configured.")
}

const sql = neon(connectionString)

await sql`ALTER TABLE dr_claims ADD COLUMN IF NOT EXISTS site_title TEXT`
await sql`ALTER TABLE dr_claims ADD COLUMN IF NOT EXISTS meta_description TEXT`
await sql`ALTER TABLE dr_claims ADD COLUMN IF NOT EXISTS site_url TEXT`
await sql`ALTER TABLE dr_claims ADD COLUMN IF NOT EXISTS screenshot_url TEXT`

const sourceRows = await sql`
  SELECT domain
  FROM (
    SELECT domain FROM dr_claims
    UNION
    SELECT domain FROM dr_checks
  ) d
`

const validDomains = Array.from(
  new Set(
    sourceRows
      .map((row) => String(row.domain ?? "").trim().toLowerCase())
      .filter((domain) => domain && isValidDomainTarget(domain))
  )
).sort()

const existingRows = await sql`
  SELECT domain
  FROM dr_claims
  WHERE site_title IS NOT NULL
     OR meta_description IS NOT NULL
     OR site_url IS NOT NULL
     OR screenshot_url IS NOT NULL
`

const alreadyPopulated = new Set(
  existingRows.map((row) => String(row.domain ?? "").trim().toLowerCase()).filter(Boolean)
)

const results = []

for (const domain of validDomains) {
  if (alreadyPopulated.has(domain)) {
    results.push({ domain, status: "skipped" })
    continue
  }

  try {
    const resolved = await resolveSitePresentation(domain)
    await sql`
      INSERT INTO dr_claims (domain, site_title, meta_description, site_url, screenshot_url)
      VALUES (
        ${domain},
        ${resolved.siteTitle ?? null},
        ${resolved.metaDescription ?? null},
        ${resolved.siteUrl ?? null},
        ${resolved.screenshotUrl ?? null}
      )
      ON CONFLICT (domain)
      DO UPDATE SET
        site_title = EXCLUDED.site_title,
        meta_description = EXCLUDED.meta_description,
        site_url = EXCLUDED.site_url,
        screenshot_url = EXCLUDED.screenshot_url,
        updated_at = NOW()
    `

    results.push({
      domain,
      status: "updated",
      source: resolved.source,
      screenshot: Boolean(resolved.screenshotUrl),
    })
  } catch (error) {
    results.push({
      domain,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

console.log(
  JSON.stringify(
    {
      totalCandidates: validDomains.length,
      skipped: results.filter((entry) => entry.status === "skipped").length,
      updated: results.filter((entry) => entry.status === "updated").length,
      failed: results.filter((entry) => entry.status === "failed").length,
      failures: results.filter((entry) => entry.status === "failed"),
    },
    null,
    2
  )
)
