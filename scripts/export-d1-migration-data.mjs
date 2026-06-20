import fs from "node:fs/promises"
import path from "node:path"

import { loadProjectEnv, getDatabaseConnectionString } from "./_load-env.mjs"
import { buildD1ImportSql, summarizeMigrationData } from "./d1-migration-data.mjs"

function printHelp() {
  console.log(`Usage: node scripts/export-d1-migration-data.mjs [options]

Exports source data through src/server/db.mjs and writes D1 import artifacts
under ./tmp/d1-migration by default. This does not apply data to D1.

Options:
  --out-dir <path>       Output directory. Default: tmp/d1-migration
  --prefix <name>        Output file prefix. Default: timestamped
  --limit <number>       Page size, max 1000. Default: 500
  --allow-empty-source   Permit fallback/in-memory export when no DB env is set
  -h, --help             Show this help
`)
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    outDir: path.resolve(process.cwd(), "tmp", "d1-migration"),
    prefix: "",
    limit: 500,
    allowEmptySource: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "-h" || arg === "--help") {
      options.help = true
      continue
    }
    if (arg === "--allow-empty-source") {
      options.allowEmptySource = true
      continue
    }
    if (arg === "--out-dir") {
      const value = argv[index + 1]
      if (!value) throw new Error("--out-dir requires a path")
      options.outDir = path.resolve(process.cwd(), value)
      index += 1
      continue
    }
    if (arg === "--prefix") {
      const value = argv[index + 1]
      if (!value) throw new Error("--prefix requires a value")
      options.prefix = value.replace(/[^a-zA-Z0-9_.-]/g, "-")
      index += 1
      continue
    }
    if (arg === "--limit") {
      const value = Number(argv[index + 1])
      if (!Number.isFinite(value)) throw new Error("--limit requires a number")
      options.limit = Math.max(1, Math.min(1000, Math.floor(value)))
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

async function pageAll(loader, limit) {
  const rows = []
  let offset = 0
  while (true) {
    const batch = await loader({ limit, offset })
    rows.push(...batch)
    if (batch.length < limit) break
    offset += batch.length
  }
  return rows
}

try {
  const options = parseArgs()
  if (options.help) {
    printHelp()
    process.exit(0)
  }

  loadProjectEnv()
  if (!getDatabaseConnectionString() && !options.allowEmptySource) {
    throw new Error("No source database env var found. Set POSTGRES_URL/DATABASE_URL or pass --allow-empty-source.")
  }

  const { listClaimRows, listDrChecks, listSubscriptions, listBillingAudit } = await import("../src/server/db.mjs")
  const [claims, checks, subscriptions, billingAudit] = await Promise.all([
    pageAll(listClaimRows, options.limit),
    pageAll(listDrChecks, options.limit),
    pageAll(listSubscriptions, options.limit),
    pageAll(listBillingAudit, options.limit),
  ])

  const generatedAt = new Date().toISOString()
  const data = {
    exportedAt: generatedAt,
    source: "src/server/db.mjs",
    counts: summarizeMigrationData({ claims, checks, subscriptions, billingAudit }),
    rows: { claims, checks, subscriptions, billingAudit },
  }
  const { sql, summary } = buildD1ImportSql(data.rows, { generatedAt })
  data.normalizedCounts = summary

  await fs.mkdir(options.outDir, { recursive: true })
  const prefix = options.prefix || `d1-export-${generatedAt.replace(/[:.]/g, "-")}`
  const jsonPath = path.join(options.outDir, `${prefix}.json`)
  const sqlPath = path.join(options.outDir, `${prefix}.sql`)

  await fs.writeFile(jsonPath, `${JSON.stringify(data, null, 2)}\n`)
  await fs.writeFile(sqlPath, sql)

  console.log(
    JSON.stringify(
      {
        ok: true,
        exportedAt: generatedAt,
        jsonPath: path.relative(process.cwd(), jsonPath),
        sqlPath: path.relative(process.cwd(), sqlPath),
        counts: data.counts,
        normalizedCounts: data.normalizedCounts,
      },
      null,
      2
    )
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
