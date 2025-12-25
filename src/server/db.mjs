import { neon } from "@neondatabase/serverless"

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
  if (!hasDb) return null
  await ensureTables()
  const { rows } = await sql`
    SELECT domain, email, domain_rating, provider, claimed_at, updated_at
    FROM dr_claims
    WHERE domain = ${domain}
    LIMIT 1
  `
  return rows[0] || null
}

/**
 * @param {{ domain: string, email?: (string|null), domainRating: number, provider?: (string|null) }} input
 */
export async function upsertClaim({ domain, email = null, domainRating, provider = null }) {
  if (!hasDb) return null
  await ensureTables()
  const { rows } = await sql`
    INSERT INTO dr_claims (domain, email, domain_rating, provider)
    VALUES (${domain}, ${email}, ${domainRating}, ${provider})
    ON CONFLICT (domain)
    DO UPDATE SET
      email = COALESCE(EXCLUDED.email, dr_claims.email),
      domain_rating = EXCLUDED.domain_rating,
      provider = EXCLUDED.provider,
      updated_at = NOW()
    RETURNING domain, email, domain_rating, provider, claimed_at, updated_at
  `
  return rows[0] || null
}

/**
 * Associate a domain with an email without overwriting the DR/provider.
 * @param {{ domain: string, email: string }} input
 */
export async function setClaimEmail({ domain, email }) {
  if (!hasDb) return null
  await ensureTables()
  const { rows } = await sql`
    INSERT INTO dr_claims (domain, email)
    VALUES (${domain}, ${email})
    ON CONFLICT (domain)
    DO UPDATE SET
      email = EXCLUDED.email,
      updated_at = NOW()
    RETURNING domain, email, domain_rating, provider, claimed_at, updated_at
  `
  return rows[0] || null
}

/**
 * Record a DR check point for charting.
 * @param {{ domain: string, domainRating: number, provider?: (string|null), checkedAt?: (Date|null) }} input
 */
export async function recordDrCheck({ domain, domainRating, provider = null, checkedAt = null }) {
  if (!hasDb) return null
  await ensureTables()
  const { rows } = await sql`
    INSERT INTO dr_checks (domain, domain_rating, provider, checked_at)
    VALUES (${domain}, ${domainRating}, ${provider}, COALESCE(${checkedAt}, NOW()))
    RETURNING id, domain, domain_rating, provider, checked_at
  `
  return rows[0] || null
}

/**
 * Fetch recent DR checks for a domain.
 * @param {string} domain
 * @param {{ limit?: number }} [opts]
 */
export async function getDrChecks(domain, opts = {}) {
  if (!hasDb) return []
  await ensureTables()
  const limit = Number.isFinite(opts.limit) ? Math.max(1, Math.min(365, opts.limit)) : 60
  const { rows } = await sql`
    SELECT domain_rating, provider, checked_at
    FROM dr_checks
    WHERE domain = ${domain}
    ORDER BY checked_at DESC
    LIMIT ${limit}
  `
  return rows.reverse()
}

/**
 * List claimed domains for /sites.
 * @param {{ query?: string, limit?: number, offset?: number }} [opts]
 */
export async function listClaims(opts = {}) {
  if (!hasDb) return []
  await ensureTables()

  const limit = Number.isFinite(opts.limit) ? Math.max(1, Math.min(100, opts.limit)) : 25
  const offset = Number.isFinite(opts.offset) ? Math.max(0, opts.offset) : 0
  const q = String(opts.query ?? "").trim()
  const pattern = q ? `%${q}%` : null

  const { rows } = await sql`
    SELECT domain, domain_rating, updated_at
    FROM dr_claims
    WHERE ${pattern === null} OR domain ILIKE ${pattern}
    ORDER BY updated_at DESC NULLS LAST
    LIMIT ${limit}
    OFFSET ${offset}
  `
  return rows
}

/**
 * Count claimed domains for /sites pagination.
 * @param {{ query?: string }} [opts]
 */
export async function countClaims(opts = {}) {
  if (!hasDb) return 0
  await ensureTables()

  const q = String(opts.query ?? "").trim()
  const pattern = q ? `%${q}%` : null

  const { rows } = await sql`
    SELECT COUNT(*)::int AS count
    FROM dr_claims
    WHERE ${pattern === null} OR domain ILIKE ${pattern}
  `
  return Number(rows?.[0]?.count) || 0
}
