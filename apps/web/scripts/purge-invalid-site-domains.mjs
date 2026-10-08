import { callAdminApi, parseFlagArgs, requireAdminApi } from './_admin-api.mjs'

function printHelp() {
  console.log(`Usage: node scripts/purge-invalid-site-domains.mjs [options]

Counts or purges invalid site domains and unclaimed spam sites (gambling,
escort, darknet, pharma; see src/server/site-spam.mjs) through the Worker admin API when
DR_ADMIN_BASE_URL/DR_PUBLIC_BASE_URL and DR_ADMIN_TOKEN, which must be set.

Options:
  --apply                Delete invalid rows. Default is dry run.
  -h, --help             Show this help
`)
}

const { flags, values } = parseFlagArgs()
if (flags.has('help') || flags.has('h')) {
  printHelp()
  process.exit(0)
}

const dryRun = !(flags.has('apply') || values.has('apply'))
const scanAll = true
const adminEnv = requireAdminApi()

const payload = await callAdminApi('/api/admin/sites/cleanup-invalid', {
  env: adminEnv,
  body: { dryRun, scanAll }
})
console.log(JSON.stringify(payload, null, 2))
