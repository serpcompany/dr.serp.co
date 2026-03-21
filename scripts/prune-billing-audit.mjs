import { pruneBillingAudit } from "../src/server/db.mjs"

const daysArg = Number(process.argv[2])
const daysEnv = Number(process.env.BILLING_AUDIT_RETENTION_DAYS)
const days = Number.isFinite(daysArg) ? daysArg : Number.isFinite(daysEnv) ? daysEnv : 180

const result = await pruneBillingAudit({ olderThanDays: days })

console.log(`Removed ${result.removed} billing audit records older than ${days} days.`)
console.log(`Cutoff: ${result.cutoff.toISOString()}`)
