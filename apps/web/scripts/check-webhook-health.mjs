import { loadProjectEnv } from "./_load-env.mjs"

function printHelp() {
  console.log(`Usage: node scripts/check-webhook-health.mjs

Checks GET /api/stripe/webhook/health and exits nonzero when unhealthy.

Environment:
  WEBHOOK_HEALTH_URL      Full health URL to check
  DR_PUBLIC_BASE_URL      Base URL used when WEBHOOK_HEALTH_URL is omitted
`)
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp()
  process.exit(0)
}

loadProjectEnv()

const explicitUrl = process.env.WEBHOOK_HEALTH_URL
const baseUrl = process.env.DR_PUBLIC_BASE_URL || "http://localhost:3000"
const url = explicitUrl || `${baseUrl}/api/stripe/webhook/health`

const response = await fetch(url, { method: "GET" }).catch((error) => {
  console.error(`Health check request failed for ${url}:`, error instanceof Error ? error.message : error)
  process.exit(1)
})
if (!response.ok) {
  console.error(`Health check failed with status ${response.status}`)
  process.exit(1)
}

const payload = await response.json().catch(() => ({}))
if (!payload?.ok) {
  console.error("Health check reported unhealthy status:", payload)
  process.exit(2)
}

console.log("Webhook health OK:", payload)
