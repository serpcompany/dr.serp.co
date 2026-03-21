const explicitUrl = process.env.WEBHOOK_HEALTH_URL
const baseUrl = process.env.DR_PUBLIC_BASE_URL || "http://localhost:3000"
const url = explicitUrl || `${baseUrl}/api/stripe/webhook/health`

const response = await fetch(url, { method: "GET" })
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
