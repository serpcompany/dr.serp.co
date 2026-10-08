import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const requiredFiles = [
  'open-next.config.ts',
  'worker.ts',
  'wrangler.jsonc',
  'migrations/0001_initial_d1_schema.sql',
  'src/server/rate-limit-do.mjs',
  'src/server/db-d1.test.ts',
  'src/server/rate-limit.test.ts',
  'scripts/generate-route-manifest.mjs',
  'scripts/compare-route-parity.mjs',
  'scripts/d1-migration-data.mjs'
]

const requiredPackageScripts = [
  'cf:build',
  'preview',
  'cf:staging:dry-run',
  'cf:deploy:dry-run',
  'cf-typegen',
  'routes:manifest',
  'routes:parity',
  'billing:prune-audit',
  'billing:reconcile',
  'webhook:health',
  'sites:purge-invalid',
  'sites:backfill-metadata'
]

const requiredSecrets = [
  'AHREFS_API_KEY',
  'DR_ADMIN_TOKEN',
  'STRIPE_PRICE_IDS',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'USESEND_API_KEY',
  'USESEND_FROM',
  'USESEND_OTP_SECRET'
]

function printHelp() {
  console.log(`Usage: node scripts/cloudflare-migration-audit.mjs [options]

Checks local Cloudflare migration readiness without network or database access.

Options:
  --strict               Exit nonzero when environment placeholders remain
  --pretty               Pretty-print JSON
  -h, --help             Show this help
`)
}

function parseArgs(argv) {
  const options = { strict: false, pretty: false, help: false }
  for (const arg of argv) {
    if (arg === '-h' || arg === '--help') options.help = true
    else if (arg === '--strict') options.strict = true
    else if (arg === '--pretty') options.pretty = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

async function fileExists(relativePath) {
  const result = await stat(path.resolve(process.cwd(), relativePath)).catch(() => null)
  return Boolean(result?.isFile())
}

function parseJsonc(source) {
  return JSON.parse(source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1'))
}

function unique(values) {
  return Array.from(new Set(values)).sort()
}

function collectStrings(value, acc = []) {
  if (typeof value === 'string') acc.push(value)
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, acc)
  else if (value && typeof value === 'object')
    for (const item of Object.values(value)) collectStrings(item, acc)
  return acc
}

try {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    process.exit(0)
  }

  const findings = []
  const blockers = []

  for (const relativePath of requiredFiles) {
    if (!(await fileExists(relativePath))) {
      findings.push({ severity: 'error', area: 'files', message: `Missing ${relativePath}` })
    }
  }

  const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
  for (const scriptName of requiredPackageScripts) {
    if (!packageJson.scripts?.[scriptName]) {
      findings.push({
        severity: 'error',
        area: 'package.json',
        message: `Missing script ${scriptName}`
      })
    }
  }

  const wranglerSource = await readFile('wrangler.jsonc', 'utf8')
  const wrangler = parseJsonc(wranglerSource)
  const wranglerStrings = collectStrings(wrangler)

  if (wrangler.main !== './worker.ts') {
    findings.push({
      severity: 'error',
      area: 'wrangler',
      message: 'main must point to ./worker.ts'
    })
  }
  if (!wrangler.compatibility_flags?.includes('nodejs_compat')) {
    findings.push({
      severity: 'error',
      area: 'wrangler',
      message: 'nodejs_compat flag is required'
    })
  }
  if (wrangler.assets?.binding !== 'ASSETS') {
    findings.push({ severity: 'error', area: 'wrangler', message: 'ASSETS binding is required' })
  }
  if (!wrangler.d1_databases?.some(entry => entry.binding === 'DB')) {
    findings.push({
      severity: 'error',
      area: 'wrangler',
      message: 'DB D1 binding is required'
    })
  }
  if (!wrangler.durable_objects?.bindings?.some(entry => entry.name === 'RATE_LIMITER')) {
    findings.push({
      severity: 'error',
      area: 'wrangler',
      message: 'RATE_LIMITER Durable Object binding is required'
    })
  }
  // The top level is local-only; a bare `wrangler` command must never reach a deployed Worker or database.
  const deployedEnvs = Object.values(wrangler.env ?? {})
  if (deployedEnvs.some(entry => entry.name === wrangler.name)) {
    findings.push({
      severity: 'error',
      area: 'wrangler',
      message: 'Top-level name must be local-only, not a deployed Worker name'
    })
  }
  if (wrangler.routes?.length || wrangler.route) {
    findings.push({
      severity: 'error',
      area: 'wrangler',
      message: 'Top-level config must not declare routes'
    })
  }
  const deployedDatabaseIds = deployedEnvs.flatMap(entry =>
    (entry.d1_databases ?? []).map(db => db.database_id)
  )
  if ((wrangler.d1_databases ?? []).some(db => deployedDatabaseIds.includes(db.database_id))) {
    findings.push({
      severity: 'error',
      area: 'wrangler',
      message: 'Top-level D1 binding must not point at a deployed database'
    })
  }
  const productionRoutes = wrangler.env?.production?.routes ?? []
  if (
    !productionRoutes.some(entry => entry.pattern === 'dr.serp.co' && entry.custom_domain === true)
  ) {
    findings.push({
      severity: 'error',
      area: 'wrangler',
      message: 'Production must attach dr.serp.co as a custom domain'
    })
  }
  if (productionRoutes.some(entry => entry.pattern === 'dr.serp.co/*')) {
    findings.push({
      severity: 'error',
      area: 'wrangler',
      message: 'Production must not use the legacy dr.serp.co/* Worker route'
    })
  }

  const declaredSecrets = unique([
    ...(wrangler.secrets?.required ?? []),
    ...(wrangler.env?.staging?.secrets?.required ?? []),
    ...(wrangler.env?.production?.secrets?.required ?? [])
  ])
  for (const secret of requiredSecrets) {
    if (!declaredSecrets.includes(secret)) {
      findings.push({
        severity: 'error',
        area: 'wrangler',
        message: `Missing required secret ${secret}`
      })
    }
  }

  const placeholders = unique(wranglerStrings.filter(value => value.includes('TODO_REPLACE')))
  if (placeholders.length) {
    blockers.push({
      area: 'environment',
      message: 'Wrangler placeholders must be replaced before remote migration or deploy',
      values: placeholders
    })
  }

  const schema = await readFile('migrations/0001_initial_d1_schema.sql', 'utf8')
  for (const table of ['dr_claims', 'dr_checks', 'dr_subscriptions', 'dr_billing_audit']) {
    if (!schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) {
      findings.push({ severity: 'error', area: 'schema', message: `Missing D1 table ${table}` })
    }
  }

  const localOk = findings.length === 0
  const remoteReady = localOk && blockers.length === 0
  const summary = {
    ok: localOk && (!options.strict || remoteReady),
    localOk,
    remoteReady,
    strict: options.strict,
    checkedAt: new Date().toISOString(),
    findings,
    blockers
  }

  console.log(JSON.stringify(summary, null, options.pretty ? 2 : 0))
  process.exit(summary.ok ? 0 : 1)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(2)
}
