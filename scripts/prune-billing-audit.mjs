import { callAdminApi, hasAdminApi, loadAdminEnv, parseFlagArgs } from "./_admin-api.mjs"

function printHelp() {
  console.log(`Usage: node scripts/prune-billing-audit.mjs [options] [days]

Counts or prunes billing audit records through the Worker admin API when
DR_ADMIN_BASE_URL/DR_PUBLIC_BASE_URL and DR_ADMIN_TOKEN are configured.
Falls back to the project DB API for local development.

Options:
  --apply                Delete matching rows. Default is dry run.
  --days <number>        Retention window in days. Default: BILLING_AUDIT_RETENTION_DAYS or 180
  -h, --help             Show this help
`)
}

const { flags, values, positionals } = parseFlagArgs()
if (flags.has("help") || flags.has("h")) {
  printHelp()
  process.exit(0)
}

const adminEnv = loadAdminEnv()
const daysEnv = Number(process.env.BILLING_AUDIT_RETENTION_DAYS)
const daysArg = Number(values.get("days") ?? values.get("older-than-days") ?? positionals[0])
const days = Number.isFinite(daysArg) ? daysArg : Number.isFinite(daysEnv) ? daysEnv : 180
const dryRun = !(flags.has("apply") || values.has("apply"))

if (hasAdminApi(adminEnv)) {
  const payload = await callAdminApi("/api/admin/billing/prune-audit", {
    env: adminEnv,
    body: { olderThanDays: days, dryRun },
  })
  console.log(JSON.stringify(payload, null, 2))
} else if (dryRun) {
  const { countPrunableBillingAudit } = await import("../src/server/db.mjs")
  const result = await countPrunableBillingAudit({ olderThanDays: days })
  console.log(`Would remove ${result.count} billing audit records older than ${days} days.`)
  console.log(`Cutoff: ${result.cutoff.toISOString()}`)
} else {
  const { pruneBillingAudit } = await import("../src/server/db.mjs")
  const result = await pruneBillingAudit({ olderThanDays: days })

  console.log(`Removed ${result.removed} billing audit records older than ${days} days.`)
  console.log(`Cutoff: ${result.cutoff.toISOString()}`)
}
