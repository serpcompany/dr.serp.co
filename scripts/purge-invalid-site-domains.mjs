import { neon } from "@neondatabase/serverless"

import { loadProjectEnv, getDatabaseConnectionString } from "./_load-env.mjs"
import { isValidDomainTarget } from "../src/server/domain-target.mjs"

loadProjectEnv()

const connectionString = getDatabaseConnectionString()
if (!connectionString) {
  throw new Error("No database connection string configured.")
}

const sql = neon(connectionString)

const rows = await sql`
  SELECT domain
  FROM (
    SELECT domain FROM dr_claims
    UNION
    SELECT domain FROM dr_checks
  ) d
`

const invalidDomains = Array.from(
  new Set(
    rows
      .map((row) => String(row.domain ?? "").trim())
      .filter((domain) => domain && !isValidDomainTarget(domain))
  )
).sort()

let deletedClaims = 0
let deletedChecks = 0

for (const domain of invalidDomains) {
  const claimRows = await sql`
    DELETE FROM dr_claims
    WHERE domain = ${domain}
    RETURNING domain
  `
  const checkRows = await sql`
    DELETE FROM dr_checks
    WHERE domain = ${domain}
    RETURNING id
  `

  deletedClaims += claimRows.length
  deletedChecks += checkRows.length
}

console.log(
  JSON.stringify(
    {
      invalidDomains,
      deletedClaims,
      deletedChecks,
    },
    null,
    2
  )
)
