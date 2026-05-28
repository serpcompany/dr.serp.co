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

  it("stores and returns resolved site presentation metadata", async () => {
    const domain = `meta-${Date.now()}.com`
    const db = await import("./db.mjs")

    await db.touchDomain(domain)
    await db.setClaimSiteMetadata({
      domain,
      siteTitle: "Meta Example",
      metaDescription: "Example description",
      siteUrl: `https://${domain}/about`,
      screenshotUrl: `https://cdn.example.com/${domain}.png`,
    })

    const claim = await db.getClaim(domain)
    const rows = await db.listSites({ limit: 100, offset: 0, sort: "updated" })
    const row = rows.find((entry) => entry.domain === domain)

    expect(claim?.site_title).toBe("Meta Example")
    expect(claim?.meta_description).toBe("Example description")
    expect(claim?.site_url).toBe(`https://${domain}/about`)
    expect(claim?.screenshot_url).toBe(`https://cdn.example.com/${domain}.png`)
    expect(row?.site_title).toBe("Meta Example")
    expect(row?.meta_description).toBe("Example description")
    expect(row?.site_url).toBe(`https://${domain}/about`)
    expect(row?.screenshot_url).toBe(`https://cdn.example.com/${domain}.png`)
  })

  it("replaces exact duplicate historical check points", async () => {
    const domain = `history-${Date.now()}.com`
    const db = await import("./db.mjs")

    await db.recordDrHistoryChecks({
      domain,
      points: [
        { checkedAt: "2026-04-01", domainRating: 42.9 },
        { checkedAt: "2026-05-01", domainRating: 43 },
      ],
    })
    await db.recordDrHistoryChecks({
      domain,
      points: [
        { checkedAt: "2026-04-01", domainRating: 44.2 },
      ],
    })

    const checks = await db.getDrChecks(domain, { limit: 10 })

    expect(checks).toEqual([
      {
        domain_rating: 44,
        provider: "ahrefs-history",
        checked_at: new Date("2026-04-01"),
      },
      {
        domain_rating: 43,
        provider: "ahrefs-history",
        checked_at: new Date("2026-05-01"),
      },
    ])
  })
})
