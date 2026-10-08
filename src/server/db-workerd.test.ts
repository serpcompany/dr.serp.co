// Runs the data layer against D1 on workerd (Miniflare), which enforces limits that the mock in
// db-d1.test.ts can't, such as D1's 50-byte LIKE pattern limit.
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { Miniflare } from "miniflare"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const binding = vi.hoisted(() => ({ db: null as unknown }))

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: { SERP_DR_DB: binding.db } }),
}))

type D1 = {
  prepare: (sql: string) => { bind: (...values: unknown[]) => { run: () => Promise<unknown> } }
  batch: (statements: unknown[]) => Promise<unknown>
}

let mf: Miniflare
let d1: D1

async function applyMigrations() {
  const dir = path.join(process.cwd(), "migrations")
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
    const statements = readFileSync(path.join(dir, file), "utf8")
      .split(/;\s*$/m)
      .map((sql) => sql.trim())
      .filter(Boolean)
    await d1.batch(statements.map((sql) => d1.prepare(sql)))
  }
}

async function insertClaim(domain: string, { email = null as string | null, rating = 50 } = {}) {
  await d1
    .prepare("INSERT INTO dr_claims (domain, email, domain_rating, updated_at) VALUES (?, ?, ?, ?)")
    .bind(domain, email, rating, "2026-10-01T00:00:00.000Z")
    .run()
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('') } }",
    d1Databases: ["SERP_DR_DB"],
  })
  d1 = (await mf.getD1Database("SERP_DR_DB")) as unknown as D1
  binding.db = d1
  await applyMigrations()
}, 30_000)

afterAll(async () => {
  await mf?.dispose()
})

beforeEach(async () => {
  await d1.batch([d1.prepare("DELETE FROM dr_claims"), d1.prepare("DELETE FROM dr_checks")])
})

const longLabel = "a".repeat(60)
const longDomain = `${longLabel}.${longLabel}.com`

describe("site search on workerd D1", () => {
  it("finds a matching row for a 200-character search", async () => {
    await insertClaim(longDomain, { email: "owner@example.com" })
    await insertClaim("example.com", { email: "owner@example.com" })
    const db = await import("./db.mjs")
    // Capped at 100 characters, the query is the first 100 characters of the domain.
    const query = `${longDomain}${"b".repeat(200)}`.slice(0, 200)

    expect(await db.listSites({ query })).toEqual([expect.objectContaining({ domain: longDomain })])
    expect(await db.countSites({ query })).toBe(1)
    expect(await db.listClaims({ query })).toEqual([expect.objectContaining({ domain: longDomain })])
    expect(await db.countClaims({ query })).toBe(1)
    expect(await db.listClaimsByEmail({ email: "owner@example.com", query })).toHaveLength(1)
    expect(await db.countClaimsByEmail({ email: "owner@example.com", query })).toBe(1)
  })

  it("finds a matching row for a CJK search longer than 50 bytes", async () => {
    // Domains are stored in punycode now; this is a row from before validation existed.
    const cjk = "例".repeat(20)
    await insertClaim(`${cjk}.jp`, { email: "owner@example.com" })
    await insertClaim("example.com", { email: "owner@example.com" })
    const db = await import("./db.mjs")

    expect(await db.listClaims({ query: cjk })).toEqual([expect.objectContaining({ domain: `${cjk}.jp` })])
    expect(await db.countClaims({ query: cjk })).toBe(1)
    expect(await db.listClaimsByEmail({ email: "owner@example.com", query: cjk })).toHaveLength(1)
    // The site list hides the invalid domain, but the search still answers.
    expect(await db.listSites({ query: cjk })).toEqual([])
    expect(await db.countSites({ query: cjk })).toBe(0)
  })

  it("folds ASCII case and collapses whitespace", async () => {
    await insertClaim("example.com")
    const db = await import("./db.mjs")

    expect(await db.listSites({ query: "  EXAMPLE  " })).toEqual([expect.objectContaining({ domain: "example.com" })])
  })

  it("fills a page past unlistable rows and counts only listable ones", async () => {
    await insertClaim("best-casino.com", { rating: 90 })
    await insertClaim("phpinfo.php", { rating: 80 })
    await insertClaim("example.com", { rating: 70 })
    await insertClaim("example.org", { rating: 60 })
    const db = await import("./db.mjs")

    expect((await db.listSites({ limit: 1 })).map((row) => row.domain)).toEqual(["example.com"])
    expect((await db.listSites({ limit: 1, offset: 1 })).map((row) => row.domain)).toEqual(["example.org"])
    expect(await db.countSites({})).toBe(2)
  })
})
