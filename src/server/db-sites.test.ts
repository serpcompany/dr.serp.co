import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const DB_ENV_KEYS = [
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "STORAGE_URL",
  "STORAGE_URL_NON_POOLING",
]

const envBackup = { ...process.env }

function clearDbEnv() {
  for (const key of DB_ENV_KEYS) {
    delete process.env[key]
  }
}

function restoreEnv() {
  for (const key of Object.keys(process.env)) delete process.env[key]
  Object.assign(process.env, envBackup)
}

describe("site listing filters invalid domains", () => {
  beforeEach(() => {
    vi.resetModules()
    clearDbEnv()
  })

  afterEach(() => {
    restoreEnv()
  })

  it("keeps junk rows out of listSites and countSites", async () => {
    const validDomain = `valid-${Date.now()}.com`
    const invalidDomain = "phpinfo.php"

    const db = await import("./db.mjs")

    await db.touchDomain(validDomain)
    await db.touchDomain(invalidDomain)

    const rows = await db.listSites({ limit: 100, offset: 0, sort: "updated" })
    const count = await db.countSites()

    expect(rows.some((row) => row.domain === validDomain)).toBe(true)
    expect(rows.some((row) => row.domain === invalidDomain)).toBe(false)
    expect(count).toBe(rows.length)

    await db.purgeInvalidSiteDomains({ domains: [invalidDomain], dryRun: false })
  })
})
