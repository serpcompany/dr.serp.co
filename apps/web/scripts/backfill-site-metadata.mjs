import { callAdminApi, parseFlagArgs, parseIntOption, requireAdminApi } from './_admin-api.mjs'

function printHelp() {
  console.log(`Usage: node scripts/backfill-site-metadata.mjs [options]

Finds sites missing presentation metadata and backfills them through the Worker
admin API. Requires DR_ADMIN_TOKEN and DR_ADMIN_BASE_URL (or DR_PUBLIC_BASE_URL).

Options:
  --apply                Resolve and write metadata. Default is dry run.
  --limit <number>       Batch size, max 100. Default: 100
  --offset <number>      Process a single page from this offset
  --query <text>         Restrict candidate domains by query
  -h, --help             Show this help
`)
}

const { flags, values } = parseFlagArgs()
if (flags.has('help') || flags.has('h')) {
  printHelp()
  process.exit(0)
}

const dryRun = !(flags.has('apply') || values.has('apply'))
const limit = parseIntOption(values.get('limit'), 100, { min: 1, max: 100 })
const query = String(values.get('query') ?? '').trim()
const adminEnv = requireAdminApi()

let offset = parseIntOption(values.get('offset'), 0, { min: 0 })
const aggregate = {
  ok: true,
  dryRun,
  total: 0,
  scanned: 0,
  candidates: 0,
  skipped: 0,
  updated: 0,
  failed: 0,
  /** @type {any[]} */
  failures: []
}

while (true) {
  const payload = await callAdminApi('/api/admin/sites/backfill-metadata', {
    env: adminEnv,
    body: { dryRun, limit, offset, query }
  })
  aggregate.total = payload.total ?? aggregate.total
  aggregate.scanned += payload.scanned ?? 0
  aggregate.candidates += payload.candidates ?? 0
  aggregate.skipped += payload.skipped ?? 0
  aggregate.updated += payload.updated ?? 0
  aggregate.failed += payload.failed ?? 0
  aggregate.failures.push(...(payload.results ?? []).filter(entry => entry.status === 'failed'))

  if (!payload.hasMore || values.has('offset')) break
  offset += payload.scanned || limit
}

console.log(JSON.stringify(aggregate, null, 2))
process.exit(aggregate.failed > 0 ? 1 : 0)
