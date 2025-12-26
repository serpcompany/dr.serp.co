import { neon } from "@neondatabase/serverless"
import fs from "node:fs"
import path from "node:path"

const connectionString =
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.STORAGE_URL ||
  process.env.STORAGE_URL_NON_POOLING

let sql = null
try {
  if (typeof connectionString === "string" && connectionString.trim()) {
    sql = neon(connectionString)
  }
} catch {
  sql = null
}

const hasDb = Boolean(sql)

// In dev/local runs, a database is often not configured. Keep a global in-memory fallback so
// checked domains still appear on /sites during the session (even across webpack bundles).
const fallbackStoreKey = "__dr_serp_fallback_store__"
/** @type {{ claims: Map<string, any>, checks: Map<string, any> }} */
const fallbackStore =
  /** @type {any} */ (globalThis)[fallbackStoreKey] ||
  ((/** @type {any} */ (globalThis)[fallbackStoreKey] = {
    claims: new Map(),
    checks: new Map(),
  }))

/** @type {Map<string, {domain: string, email: (string|null), domain_rating: (number|null), provider: (string|null), claimed_at: Date, updated_at: Date}>} */
const fallbackClaims = fallbackStore.claims
/** @type {Map<string, Array<{domain_rating: number, provider: (string|null), checked_at: Date}>>} */
const fallbackChecks = fallbackStore.checks

const persistEnabled = !hasDb && process.env.NODE_ENV !== "production"
const persistPath = path.join(process.cwd(), ".cache", "dr-fallback.json")
const persistTimerKey = "__dr_serp_fallback_persist_timer__"

function hydrateFromDisk() {
  if (!persistEnabled) return
  try {
    if (!fs.existsSync(persistPath)) return
    const raw = fs.readFileSync(persistPath, "utf8")
    if (!raw) return
    const parsed = JSON.parse(raw)

    const claims = Array.isArray(parsed?.claims) ? parsed.claims : []
    for (const row of claims) {
      const domain = String(row?.domain ?? "").trim()
      if (!domain) continue
      const claimedAt = row?.claimed_at ? new Date(row.claimed_at) : new Date()
      const updatedAt = row?.updated_at ? new Date(row.updated_at) : new Date()
      fallbackClaims.set(domain, {
        domain,
        email: row?.email ?? null,
        domain_rating: typeof row?.domain_rating === "number" ? row.domain_rating : null,
        provider: row?.provider ?? null,
        claimed_at: Number.isFinite(claimedAt.getTime()) ? claimedAt : new Date(),
        updated_at: Number.isFinite(updatedAt.getTime()) ? updatedAt : new Date(),
      })
    }

    const checks = parsed?.checks && typeof parsed.checks === "object" ? parsed.checks : {}
    for (const [domain, list] of Object.entries(checks)) {
      if (!Array.isArray(list)) continue
      const normalizedDomain = String(domain ?? "").trim()
      if (!normalizedDomain) continue
      const next = []
      for (const item of list) {
        const dr = clampDr(item?.domain_rating)
        if (dr === null) continue
        const checkedAt = item?.checked_at ? new Date(item.checked_at) : new Date()
        next.push({
          domain_rating: dr,
          provider: item?.provider ?? null,
          checked_at: Number.isFinite(checkedAt.getTime()) ? checkedAt : new Date(),
        })
      }
      if (next.length) fallbackChecks.set(normalizedDomain, next)
    }
  } catch {
    // ignore
  }
}

function schedulePersist() {
  if (!persistEnabled) return
  const existing = /** @type {any} */ (globalThis)[persistTimerKey]
  if (existing) return

  /** @type {any} */ (globalThis)[persistTimerKey] = setTimeout(() => {
    /** @type {any} */ (globalThis)[persistTimerKey] = null
    try {
      fs.mkdirSync(path.dirname(persistPath), { recursive: true })

      const claims = Array.from(fallbackClaims.values()).map((row) => ({
        domain: row.domain,
        email: row.email ?? null,
        domain_rating: typeof row.domain_rating === "number" ? row.domain_rating : null,
        provider: row.provider ?? null,
        claimed_at: row.claimed_at instanceof Date ? row.claimed_at.toISOString() : null,
        updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : null,
      }))

      const checks = {}
      for (const [domain, list] of fallbackChecks.entries()) {
        checks[domain] = list.map((item) => ({
          domain_rating: item.domain_rating,
          provider: item.provider ?? null,
          checked_at: item.checked_at instanceof Date ? item.checked_at.toISOString() : null,
        }))
      }

      fs.writeFileSync(persistPath, JSON.stringify({ claims, checks }, null, 2))
    } catch {
      // ignore
    }
  }, 250)
}

hydrateFromDisk()

function clampDr(value) {
  const dr = Math.max(0, Math.min(100, Math.floor(Number(value))))
  return Number.isFinite(dr) ? dr : null
}

function rowsFrom(result) {
  if (!result) return []
  if (Array.isArray(result)) return result
  if (Array.isArray(result.rows)) return result.rows
  return []
}

async function ensureTables() {
  if (!hasDb) return
  await sql`
    CREATE TABLE IF NOT EXISTS dr_claims (
      domain TEXT PRIMARY KEY,
      email TEXT,
      domain_rating INT,
      provider TEXT,
      claimed_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS dr_checks (
      id BIGSERIAL PRIMARY KEY,
      domain TEXT NOT NULL,
      domain_rating INT NOT NULL,
      provider TEXT,
      checked_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS dr_checks_domain_checked_at_idx ON dr_checks (domain, checked_at DESC)`
}

/**
 * @param {string} domain
 */
export async function getClaim(domain) {
  if (!hasDb) {
    const row = fallbackClaims.get(domain)
    return row || null
  }
  await ensureTables()
  const rows = rowsFrom(await sql`
    SELECT domain, email, domain_rating, provider, claimed_at, updated_at
    FROM dr_claims
    WHERE domain = ${domain}
    LIMIT 1
  `)
  return rows[0] || null
}

/**
 * @param {{ domain: string, email?: (string|null), domainRating: number, provider?: (string|null) }} input
 */
export async function upsertClaim({ domain, email = null, domainRating, provider = null }) {
  if (!hasDb) {
    const now = new Date()
    const previous = fallbackClaims.get(domain)
    const claimedAt = previous?.claimed_at || now
    const next = {
      domain,
      email: email ?? previous?.email ?? null,
      domain_rating: clampDr(domainRating),
      provider: provider ?? null,
      claimed_at: claimedAt,
      updated_at: now,
    }
    fallbackClaims.set(domain, next)
    schedulePersist()
    return next
  }
  await ensureTables()
  const rows = rowsFrom(await sql`
    INSERT INTO dr_claims (domain, email, domain_rating, provider)
    VALUES (${domain}, ${email}, ${domainRating}, ${provider})
    ON CONFLICT (domain)
    DO UPDATE SET
      email = COALESCE(EXCLUDED.email, dr_claims.email),
      domain_rating = EXCLUDED.domain_rating,
      provider = EXCLUDED.provider,
      updated_at = NOW()
    RETURNING domain, email, domain_rating, provider, claimed_at, updated_at
  `)
  return rows[0] || null
}

/**
 * Associate a domain with an email without overwriting the DR/provider.
 * @param {{ domain: string, email: string }} input
 */
export async function setClaimEmail({ domain, email }) {
  if (!hasDb) {
    const now = new Date()
    const previous = fallbackClaims.get(domain)
    const claimedAt = previous?.claimed_at || now
    const next = {
      domain,
      email,
      domain_rating: previous?.domain_rating ?? null,
      provider: previous?.provider ?? null,
      claimed_at: claimedAt,
      updated_at: now,
    }
    fallbackClaims.set(domain, next)
    schedulePersist()
    return next
  }
  await ensureTables()
  const rows = rowsFrom(await sql`
    INSERT INTO dr_claims (domain, email)
    VALUES (${domain}, ${email})
    ON CONFLICT (domain)
    DO UPDATE SET
      email = EXCLUDED.email,
      updated_at = NOW()
    RETURNING domain, email, domain_rating, provider, claimed_at, updated_at
  `)
  return rows[0] || null
}

/**
 * Ensure a domain exists in storage even if DR cannot be fetched yet.
 * This keeps /sites from showing "No domains" after a user visits a domain page.
 * @param {string} domain
 */
export async function touchDomain(domain) {
  const normalized = String(domain ?? "").trim()
  if (!normalized) return null

  if (!hasDb) {
    const now = new Date()
    const previous = fallbackClaims.get(normalized)
    const claimedAt = previous?.claimed_at || now
    const next = {
      domain: normalized,
      email: previous?.email ?? null,
      domain_rating: previous?.domain_rating ?? null,
      provider: previous?.provider ?? null,
      claimed_at: claimedAt,
      updated_at: now,
    }
    fallbackClaims.set(normalized, next)
    schedulePersist()
    return next
  }

  await ensureTables()
  const rows = rowsFrom(await sql`
    INSERT INTO dr_claims (domain)
    VALUES (${normalized})
    ON CONFLICT (domain)
    DO UPDATE SET
      updated_at = NOW()
    RETURNING domain, email, domain_rating, provider, claimed_at, updated_at
  `)
  return rows[0] || null
}

/**
 * Record a DR check point for charting.
 * @param {{ domain: string, domainRating: number, provider?: (string|null), checkedAt?: (Date|null) }} input
 */
export async function recordDrCheck({ domain, domainRating, provider = null, checkedAt = null }) {
  if (!hasDb) {
    const safeRating = clampDr(domainRating)
    if (safeRating === null) return null
    const list = fallbackChecks.get(domain) || []
    const next = {
      domain_rating: safeRating,
      provider: provider ?? null,
      checked_at: checkedAt instanceof Date ? checkedAt : new Date(),
    }
    list.push(next)
    // Keep memory bounded similar to SQL limit cap.
    if (list.length > 365) list.splice(0, list.length - 365)
    fallbackChecks.set(domain, list)
    schedulePersist()
    return { id: null, domain, ...next }
  }
  await ensureTables()
  const rows = rowsFrom(await sql`
    INSERT INTO dr_checks (domain, domain_rating, provider, checked_at)
    VALUES (${domain}, ${domainRating}, ${provider}, COALESCE(${checkedAt}, NOW()))
    RETURNING id, domain, domain_rating, provider, checked_at
  `)
  return rows[0] || null
}

/**
 * Fetch recent DR checks for a domain.
 * @param {string} domain
 * @param {{ limit?: number }} [opts]
 */
export async function getDrChecks(domain, opts = {}) {
  if (!hasDb) {
    const list = fallbackChecks.get(domain) || []
    const limit = Number.isFinite(opts.limit) ? Math.max(1, Math.min(365, opts.limit)) : 60
    return list.slice(Math.max(0, list.length - limit))
  }
  await ensureTables()
  const limit = Number.isFinite(opts.limit) ? Math.max(1, Math.min(365, opts.limit)) : 60
  const rows = rowsFrom(await sql`
    SELECT domain_rating, provider, checked_at
    FROM dr_checks
    WHERE domain = ${domain}
    ORDER BY checked_at DESC
    LIMIT ${limit}
  `)
  return rows.reverse()
}

/**
 * List claimed domains for /sites.
 * @param {{ query?: string, limit?: number, offset?: number, sort?: ("dr"|"updated") }} [opts]
 */
export async function listClaims(opts = {}) {
  if (!hasDb) {
    const limit = Number.isFinite(opts.limit) ? Math.max(1, Math.min(100, opts.limit)) : 25
    const offset = Number.isFinite(opts.offset) ? Math.max(0, opts.offset) : 0
    const q = String(opts.query ?? "").trim().toLowerCase()
    const sort = opts.sort === "updated" ? "updated" : "dr"

    const filtered = Array.from(fallbackClaims.values()).filter((row) =>
      q ? row.domain.toLowerCase().includes(q) : true
    )

    const rows = filtered.sort((a, b) => {
      if (sort === "updated") {
        const diff = b.updated_at.getTime() - a.updated_at.getTime()
        if (diff) return diff
        return a.domain.localeCompare(b.domain)
      }

      const adr = a.domain_rating
      const bdr = b.domain_rating
      const aHas = typeof adr === "number" && Number.isFinite(adr)
      const bHas = typeof bdr === "number" && Number.isFinite(bdr)
      if (aHas && bHas && adr !== bdr) return bdr - adr
      if (aHas !== bHas) return aHas ? -1 : 1

      const diff = b.updated_at.getTime() - a.updated_at.getTime()
      if (diff) return diff
      return a.domain.localeCompare(b.domain)
    })

    return rows.slice(offset, offset + limit).map((row) => ({
      domain: row.domain,
      domain_rating: row.domain_rating,
      updated_at: row.updated_at.toISOString(),
    }))
  }
  await ensureTables()

  const limit = Number.isFinite(opts.limit) ? Math.max(1, Math.min(100, opts.limit)) : 25
  const offset = Number.isFinite(opts.offset) ? Math.max(0, opts.offset) : 0
  const q = String(opts.query ?? "").trim()
  const pattern = q ? `%${q}%` : null
  const sort = opts.sort === "updated" ? "updated" : "dr"

  const result =
    sort === "updated"
      ? await sql`
          SELECT domain, domain_rating, updated_at
          FROM dr_claims
          WHERE ${pattern === null} OR domain ILIKE ${pattern}
          ORDER BY updated_at DESC NULLS LAST, domain ASC
          LIMIT ${limit}
          OFFSET ${offset}
        `
      : await sql`
          SELECT domain, domain_rating, updated_at
          FROM dr_claims
          WHERE ${pattern === null} OR domain ILIKE ${pattern}
          ORDER BY domain_rating DESC NULLS LAST, updated_at DESC NULLS LAST, domain ASC
          LIMIT ${limit}
          OFFSET ${offset}
        `
  return rowsFrom(result)
}

/**
 * Count claimed domains for /sites pagination.
 * @param {{ query?: string }} [opts]
 */
export async function countClaims(opts = {}) {
  if (!hasDb) {
    const q = String(opts.query ?? "").trim().toLowerCase()
    if (!q) return fallbackClaims.size
    let count = 0
    for (const row of fallbackClaims.values()) {
      if (row.domain.toLowerCase().includes(q)) count += 1
    }
    return count
  }
  await ensureTables()

  const q = String(opts.query ?? "").trim()
  const pattern = q ? `%${q}%` : null

  const rows = rowsFrom(await sql`
    SELECT COUNT(*)::int AS count
    FROM dr_claims
    WHERE ${pattern === null} OR domain ILIKE ${pattern}
  `)
  return Number(rows?.[0]?.count) || 0
}

/**
 * List claimed domains for a specific email.
 * @param {{ email: string, query?: string, limit?: number, offset?: number, sort?: ("dr"|"updated") }} opts
 */
export async function listClaimsByEmail(opts) {
  const email = String(opts?.email ?? "").trim().toLowerCase()
  if (!email) return []

  if (!hasDb) {
    const limit = Number.isFinite(opts.limit) ? Math.max(1, Math.min(100, opts.limit)) : 25
    const offset = Number.isFinite(opts.offset) ? Math.max(0, opts.offset) : 0
    const q = String(opts.query ?? "").trim().toLowerCase()
    const sort = opts.sort === "updated" ? "updated" : "dr"

    const filtered = Array.from(fallbackClaims.values()).filter((row) => {
      if (String(row.email ?? "").trim().toLowerCase() !== email) return false
      return q ? String(row.domain).toLowerCase().includes(q) : true
    })

    filtered.sort((a, b) => {
      if (sort === "updated") {
        const diff = b.updated_at.getTime() - a.updated_at.getTime()
        if (diff) return diff
        return a.domain.localeCompare(b.domain)
      }

      const adr = a.domain_rating
      const bdr = b.domain_rating
      const aHas = typeof adr === "number" && Number.isFinite(adr)
      const bHas = typeof bdr === "number" && Number.isFinite(bdr)
      if (aHas && bHas && adr !== bdr) return bdr - adr
      if (aHas !== bHas) return aHas ? -1 : 1

      const diff = b.updated_at.getTime() - a.updated_at.getTime()
      if (diff) return diff
      return a.domain.localeCompare(b.domain)
    })

    return filtered.slice(offset, offset + limit).map((row) => ({
      domain: row.domain,
      domain_rating: row.domain_rating,
      updated_at: row.updated_at.toISOString(),
    }))
  }

  await ensureTables()

  const limit = Number.isFinite(opts.limit) ? Math.max(1, Math.min(100, opts.limit)) : 25
  const offset = Number.isFinite(opts.offset) ? Math.max(0, opts.offset) : 0
  const q = String(opts.query ?? "").trim()
  const pattern = q ? `%${q}%` : null
  const sort = opts.sort === "updated" ? "updated" : "dr"

  const result =
    sort === "updated"
      ? await sql`
          SELECT domain, domain_rating, updated_at
          FROM dr_claims
          WHERE email = ${email} AND (${pattern === null} OR domain ILIKE ${pattern})
          ORDER BY updated_at DESC NULLS LAST, domain ASC
          LIMIT ${limit}
          OFFSET ${offset}
        `
      : await sql`
          SELECT domain, domain_rating, updated_at
          FROM dr_claims
          WHERE email = ${email} AND (${pattern === null} OR domain ILIKE ${pattern})
          ORDER BY domain_rating DESC NULLS LAST, updated_at DESC NULLS LAST, domain ASC
          LIMIT ${limit}
          OFFSET ${offset}
        `

  return rowsFrom(result)
}

/**
 * Count claimed domains for a specific email.
 * @param {{ email: string, query?: string }} opts
 */
export async function countClaimsByEmail(opts) {
  const email = String(opts?.email ?? "").trim().toLowerCase()
  if (!email) return 0

  if (!hasDb) {
    const q = String(opts.query ?? "").trim().toLowerCase()
    let count = 0
    for (const row of fallbackClaims.values()) {
      if (String(row.email ?? "").trim().toLowerCase() !== email) continue
      if (q && !String(row.domain).toLowerCase().includes(q)) continue
      count += 1
    }
    return count
  }

  await ensureTables()

  const q = String(opts.query ?? "").trim()
  const pattern = q ? `%${q}%` : null

  const rows = rowsFrom(await sql`
    SELECT COUNT(*)::int AS count
    FROM dr_claims
    WHERE email = ${email} AND (${pattern === null} OR domain ILIKE ${pattern})
  `)
  return Number(rows?.[0]?.count) || 0
}

/**
 * List all domains that have ever been checked (backed by dr_checks).
 * @param {{ query?: string, limit?: number, offset?: number, sort?: ("dr"|"updated") }} [opts]
 */
export async function listSites(opts = {}) {
  if (!hasDb) {
    const limit = Number.isFinite(opts.limit) ? Math.max(1, Math.min(100, opts.limit)) : 25
    const offset = Number.isFinite(opts.offset) ? Math.max(0, opts.offset) : 0
    const q = String(opts.query ?? "").trim().toLowerCase()
    const sort = opts.sort === "updated" ? "updated" : "dr"

    const domains = new Set([...fallbackChecks.keys(), ...fallbackClaims.keys()])
    const rows = Array.from(domains).map((domain) => {
      const checks = fallbackChecks.get(domain) || []
      const lastCheck = checks.length > 0 ? checks[checks.length - 1] : null
      const claim = fallbackClaims.get(domain) || null

      const domainRating =
        lastCheck && Number.isFinite(lastCheck.domain_rating)
          ? Number(lastCheck.domain_rating)
          : claim && Number.isFinite(claim.domain_rating)
            ? Number(claim.domain_rating)
            : null

      const updatedAt =
        (lastCheck?.checked_at instanceof Date && lastCheck.checked_at) ||
        (claim?.updated_at instanceof Date && claim.updated_at) ||
        null

      return {
        domain,
        domain_rating: domainRating,
        updated_at: updatedAt ? updatedAt.toISOString() : null,
      }
    })

    const filtered = rows.filter((row) => (q ? row.domain.toLowerCase().includes(q) : true))
    filtered.sort((a, b) => {
      if (sort === "updated") {
        const at = a.updated_at ? Date.parse(a.updated_at) : -Infinity
        const bt = b.updated_at ? Date.parse(b.updated_at) : -Infinity
        if (bt !== at) return bt - at
        return a.domain.localeCompare(b.domain)
      }

      const adr = a.domain_rating
      const bdr = b.domain_rating
      const aHas = typeof adr === "number" && Number.isFinite(adr)
      const bHas = typeof bdr === "number" && Number.isFinite(bdr)
      if (aHas && bHas && adr !== bdr) return bdr - adr
      if (aHas !== bHas) return aHas ? -1 : 1

      const at = a.updated_at ? Date.parse(a.updated_at) : -Infinity
      const bt = b.updated_at ? Date.parse(b.updated_at) : -Infinity
      if (bt !== at) return bt - at
      return a.domain.localeCompare(b.domain)
    })

    return filtered.slice(offset, offset + limit)
  }

  await ensureTables()

  const limit = Number.isFinite(opts.limit) ? Math.max(1, Math.min(100, opts.limit)) : 25
  const offset = Number.isFinite(opts.offset) ? Math.max(0, opts.offset) : 0
  const q = String(opts.query ?? "").trim()
  const pattern = q ? `%${q}%` : null
  const sort = opts.sort === "updated" ? "updated" : "dr"

  const result =
    sort === "updated"
      ? await sql`
          SELECT
            d.domain,
            COALESCE(c.domain_rating, cl.domain_rating) AS domain_rating,
            GREATEST(c.updated_at, cl.updated_at) AS updated_at
          FROM (
            SELECT domain FROM dr_claims
            UNION
            SELECT domain FROM dr_checks
          ) d
          LEFT JOIN LATERAL (
            SELECT domain_rating, checked_at AS updated_at
            FROM dr_checks
            WHERE domain = d.domain
            ORDER BY checked_at DESC
            LIMIT 1
          ) c ON true
          LEFT JOIN dr_claims cl ON cl.domain = d.domain
          WHERE ${pattern === null} OR d.domain ILIKE ${pattern}
          ORDER BY updated_at DESC NULLS LAST, d.domain ASC
          LIMIT ${limit}
          OFFSET ${offset}
        `
      : await sql`
          SELECT
            d.domain,
            COALESCE(c.domain_rating, cl.domain_rating) AS domain_rating,
            GREATEST(c.updated_at, cl.updated_at) AS updated_at
          FROM (
            SELECT domain FROM dr_claims
            UNION
            SELECT domain FROM dr_checks
          ) d
          LEFT JOIN LATERAL (
            SELECT domain_rating, checked_at AS updated_at
            FROM dr_checks
            WHERE domain = d.domain
            ORDER BY checked_at DESC
            LIMIT 1
          ) c ON true
          LEFT JOIN dr_claims cl ON cl.domain = d.domain
          WHERE ${pattern === null} OR d.domain ILIKE ${pattern}
          ORDER BY domain_rating DESC NULLS LAST, updated_at DESC NULLS LAST, d.domain ASC
          LIMIT ${limit}
          OFFSET ${offset}
        `

  return rowsFrom(result)
}

/**
 * Count all domains that have ever been checked (backed by dr_checks).
 * @param {{ query?: string }} [opts]
 */
export async function countSites(opts = {}) {
  if (!hasDb) {
    const q = String(opts.query ?? "").trim().toLowerCase()
    if (!q) return new Set([...fallbackChecks.keys(), ...fallbackClaims.keys()]).size
    let count = 0
    const domains = new Set([...fallbackChecks.keys(), ...fallbackClaims.keys()])
    for (const domain of domains) {
      if (domain.toLowerCase().includes(q)) count += 1
    }
    return count
  }

  await ensureTables()

  const q = String(opts.query ?? "").trim()
  const pattern = q ? `%${q}%` : null

  const rows = rowsFrom(await sql`
    SELECT COUNT(*)::int AS count
    FROM (
      SELECT domain FROM dr_claims
      UNION
      SELECT domain FROM dr_checks
    ) d
    WHERE ${pattern === null} OR d.domain ILIKE ${pattern}
  `)
  return Number(rows?.[0]?.count) || 0
}
