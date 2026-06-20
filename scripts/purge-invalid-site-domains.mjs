import { callAdminApi, hasAdminApi, loadAdminEnv, parseFlagArgs } from "./_admin-api.mjs"
import { loadProjectEnv } from "./_load-env.mjs"

function printHelp() {
  console.log(`Usage: node scripts/purge-invalid-site-domains.mjs [options]

Counts or purges invalid site domains through the Worker admin API when
DR_ADMIN_BASE_URL/DR_PUBLIC_BASE_URL and DR_ADMIN_TOKEN are configured.
Falls back to the project DB API for local development.

Options:
  --apply                Delete invalid rows. Default is dry run.
  -h, --help             Show this help
`)
}

const { flags, values } = parseFlagArgs()
if (flags.has("help") || flags.has("h")) {
  printHelp()
  process.exit(0)
}

const dryRun = !(flags.has("apply") || values.has("apply"))
const scanAll = true
const adminEnv = loadAdminEnv()

if (hasAdminApi(adminEnv)) {
  const payload = await callAdminApi("/api/admin/sites/cleanup-invalid", {
    env: adminEnv,
    body: { dryRun, scanAll },
  })
  console.log(JSON.stringify(payload, null, 2))
} else {
  loadProjectEnv()
  const { purgeInvalidSiteDomains } = await import("../src/server/db.mjs")
  const result = await purgeInvalidSiteDomains({ dryRun })
  console.log(JSON.stringify({ ok: true, ...result }, null, 2))
}
