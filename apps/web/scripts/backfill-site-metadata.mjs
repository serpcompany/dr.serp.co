import { resolveSitePresentation } from '../src/server/site-presentation.mjs'
import {
  callAdminApi,
  hasAdminApi,
  loadAdminEnv,
  parseFlagArgs,
  parseIntOption
} from './_admin-api.mjs'
import { loadProjectEnv } from './_load-env.mjs'

function printHelp() {
  console.log(`Usage: node scripts/backfill-site-metadata.mjs [options]

Finds sites missing presentation metadata and backfills them through the Worker
admin API when DR_ADMIN_BASE_URL/DR_PUBLIC_BASE_URL and DR_ADMIN_TOKEN are
configured. Falls back to the project DB API for local development.

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
const adminEnv = loadAdminEnv()

if (hasAdminApi(adminEnv)) {
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
}

loadProjectEnv()
const { countSites, listSites, setClaimSiteMetadata } = await import('../src/server/db.mjs')

function hasPresentationMetadata(site) {
  return Boolean(site.site_title || site.meta_description || site.site_url || site.screenshot_url)
}

const total = await countSites({ query })
const validDomains = []
let offset = parseIntOption(values.get('offset'), 0, { min: 0 })

while (true) {
  const rows = await listSites({ query, limit, offset, sort: 'updated' })
  for (const row of rows) {
    if (!hasPresentationMetadata(row)) validDomains.push(row.domain)
  }
  if (rows.length < limit || values.has('offset')) break
  offset += rows.length
}

const results = []

for (const domain of validDomains) {
  if (dryRun) {
    results.push({ domain, status: 'pending' })
    continue
  }

  try {
    const resolved = await resolveSitePresentation(domain)
    await setClaimSiteMetadata({
      domain,
      siteTitle: resolved.siteTitle ?? null,
      metaDescription: resolved.metaDescription ?? null,
      siteUrl: resolved.siteUrl ?? null,
      screenshotUrl: resolved.screenshotUrl ?? null
    })

    results.push({
      domain,
      status: 'updated',
      source: resolved.source,
      screenshot: Boolean(resolved.screenshotUrl)
    })
  } catch (error) {
    results.push({
      domain,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      dryRun,
      total,
      totalCandidates: validDomains.length,
      pending: results.filter(entry => entry.status === 'pending').length,
      updated: results.filter(entry => entry.status === 'updated').length,
      failed: results.filter(entry => entry.status === 'failed').length,
      failures: results.filter(entry => entry.status === 'failed')
    },
    null,
    2
  )
)
