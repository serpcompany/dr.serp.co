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
/** @type {{ claims: Map<string, any>, checks: Map<string, any>, subscriptions: Map<string, any>, billingAudit: Array<any> }} */
const fallbackStore =
  /** @type {any} */ (globalThis)[fallbackStoreKey] ||
  ((/** @type {any} */ (globalThis)[fallbackStoreKey] = {
    claims: new Map(),
    checks: new Map(),
    subscriptions: new Map(),
    billingAudit: [],
  }))

/** @type {Map<string, {domain: string, email: (string|null), domain_rating: (number|null), provider: (string|null), claimed_at: Date, updated_at: Date}>} */
const fallbackClaims = fallbackStore.claims
/** @type {Map<string, Array<{domain_rating: number, provider: (string|null), checked_at: Date}>>} */
const fallbackChecks = fallbackStore.checks
/** @type {Map<string, any>} */
const fallbackSubscriptions = fallbackStore.subscriptions
/** @type {Array<any>} */
const fallbackBillingAudit = fallbackStore.billingAudit

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

    const subscriptions = Array.isArray(parsed?.subscriptions) ? parsed.subscriptions : []
    for (const row of subscriptions) {
      const subscriptionId = String(row?.stripe_subscription_id ?? "").trim()
      const email = normalizeEmail(row?.email)
      if (!subscriptionId || !email) continue
      const currentPeriodEnd = row?.current_period_end ? new Date(row.current_period_end) : null
      const createdAt = row?.created_at ? new Date(row.created_at) : new Date()
      const updatedAt = row?.updated_at ? new Date(row.updated_at) : new Date()
      fallbackSubscriptions.set(subscriptionId, {
        email,
        stripe_customer_id: row?.stripe_customer_id ?? null,
        stripe_subscription_id: subscriptionId,
        stripe_price_id: row?.stripe_price_id ?? null,
        billing_interval: row?.billing_interval ?? null,
        domains_limit: Number.isFinite(Number(row?.domains_limit))
          ? Number(row.domains_limit)
          : null,
        status: row?.status ?? null,
        current_period_end: Number.isFinite(currentPeriodEnd?.getTime())
          ? currentPeriodEnd
          : null,
        cancel_at_period_end:
          typeof row?.cancel_at_period_end === "boolean" ? row.cancel_at_period_end : null,
        created_at: Number.isFinite(createdAt.getTime()) ? createdAt : new Date(),
        updated_at: Number.isFinite(updatedAt.getTime()) ? updatedAt : new Date(),
      })
    }

    const billingAudit = Array.isArray(parsed?.billingAudit) ? parsed.billingAudit : []
    for (const row of billingAudit) {
      const createdAt = row?.created_at ? new Date(row.created_at) : new Date()
      const eventCreatedAt = row?.event_created_at ? new Date(row.event_created_at) : null
      const currentPeriodEnd = row?.current_period_end ? new Date(row.current_period_end) : null
      fallbackBillingAudit.push({
        stripe_event_id: row?.stripe_event_id ?? null,
        stripe_event_type: row?.stripe_event_type ?? null,
        stripe_customer_id: row?.stripe_customer_id ?? null,
        stripe_subscription_id: row?.stripe_subscription_id ?? null,
        stripe_price_id: row?.stripe_price_id ?? null,
        email: row?.email ?? null,
        billing_interval: row?.billing_interval ?? null,
        domains_limit: Number.isFinite(Number(row?.domains_limit)) ? Number(row.domains_limit) : null,
        status: row?.status ?? null,
        current_period_end: Number.isFinite(currentPeriodEnd?.getTime()) ? currentPeriodEnd : null,
        cancel_at_period_end:
          typeof row?.cancel_at_period_end === "boolean" ? row.cancel_at_period_end : null,
        event_created_at: Number.isFinite(eventCreatedAt?.getTime()) ? eventCreatedAt : null,
        success: typeof row?.success === "boolean" ? row.success : true,
        error: row?.error ?? null,
        created_at: Number.isFinite(createdAt.getTime()) ? createdAt : new Date(),
      })
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

      const subscriptions = Array.from(fallbackSubscriptions.values()).map((row) => ({
        email: row.email,
        stripe_customer_id: row.stripe_customer_id ?? null,
        stripe_subscription_id: row.stripe_subscription_id,
        stripe_price_id: row.stripe_price_id ?? null,
        billing_interval: row.billing_interval ?? null,
        domains_limit: row.domains_limit ?? null,
        status: row.status ?? null,
        current_period_end:
          row.current_period_end instanceof Date
            ? row.current_period_end.toISOString()
            : null,
        cancel_at_period_end: row.cancel_at_period_end ?? null,
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : null,
        updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : null,
      }))

      const billingAudit = fallbackBillingAudit.slice(-250).map((row) => ({
        stripe_event_id: row.stripe_event_id ?? null,
        stripe_event_type: row.stripe_event_type ?? null,
        stripe_customer_id: row.stripe_customer_id ?? null,
        stripe_subscription_id: row.stripe_subscription_id ?? null,
        stripe_price_id: row.stripe_price_id ?? null,
        email: row.email ?? null,
        billing_interval: row.billing_interval ?? null,
        domains_limit: row.domains_limit ?? null,
        status: row.status ?? null,
        current_period_end:
          row.current_period_end instanceof Date
            ? row.current_period_end.toISOString()
            : null,
        cancel_at_period_end: row.cancel_at_period_end ?? null,
        event_created_at:
          row.event_created_at instanceof Date
            ? row.event_created_at.toISOString()
            : null,
        success: typeof row.success === "boolean" ? row.success : true,
        error: row.error ?? null,
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : null,
      }))

      fs.writeFileSync(
        persistPath,
        JSON.stringify({ claims, checks, subscriptions, billingAudit }, null, 2)
      )
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
  await sql`
    CREATE TABLE IF NOT EXISTS dr_subscriptions (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT UNIQUE,
      stripe_price_id TEXT,
      billing_interval TEXT,
      domains_limit INT,
      status TEXT,
      current_period_end TIMESTAMPTZ,
      cancel_at_period_end BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS dr_subscriptions_email_idx ON dr_subscriptions (email)`
  await sql`CREATE INDEX IF NOT EXISTS dr_subscriptions_customer_idx ON dr_subscriptions (stripe_customer_id)`
  await sql`
    CREATE TABLE IF NOT EXISTS dr_billing_audit (
      id BIGSERIAL PRIMARY KEY,
      stripe_event_id TEXT UNIQUE,
      stripe_event_type TEXT NOT NULL,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      stripe_price_id TEXT,
      email TEXT,
      billing_interval TEXT,
      domains_limit INT,
      status TEXT,
      current_period_end TIMESTAMPTZ,
      cancel_at_period_end BOOLEAN DEFAULT FALSE,
      event_created_at TIMESTAMPTZ,
      success BOOLEAN DEFAULT TRUE,
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS dr_billing_audit_email_idx ON dr_billing_audit (email)`
  await sql`CREATE INDEX IF NOT EXISTS dr_billing_audit_subscription_idx ON dr_billing_audit (stripe_subscription_id)`
  await sql`CREATE INDEX IF NOT EXISTS dr_billing_audit_created_idx ON dr_billing_audit (created_at DESC)`
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
 * Remove a claim's email association if it matches the provided email.
 * Keeps the domain + DR data intact (so it can still appear in /sites).
 * @param {{ domain: string, email: string }} input
 */
export async function clearClaimEmail({ domain, email }) {
  const normalizedDomain = String(domain ?? "").trim()
  const normalizedEmail = String(email ?? "").trim().toLowerCase()
  if (!normalizedDomain || !normalizedEmail) return null

  if (!hasDb) {
    const previous = fallbackClaims.get(normalizedDomain)
    if (!previous) return null
    if (String(previous.email ?? "").trim().toLowerCase() !== normalizedEmail) return previous
    const now = new Date()
    const next = {
      ...previous,
      email: null,
      updated_at: now,
    }
    fallbackClaims.set(normalizedDomain, next)
    schedulePersist()
    return next
  }

  await ensureTables()
  const rows = rowsFrom(await sql`
    UPDATE dr_claims
    SET email = NULL, updated_at = NOW()
    WHERE domain = ${normalizedDomain} AND email = ${normalizedEmail}
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

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase()
}

/**
 * Upsert a subscription record keyed by stripe_subscription_id.
 * @param {{
 *  email: string,
 *  stripeCustomerId?: (string|null),
 *  stripeSubscriptionId: string,
 *  stripePriceId?: (string|null),
 *  billingInterval?: (string|null),
 *  domainsLimit?: (number|null),
 *  status?: (string|null),
 *  currentPeriodEnd?: (Date|null),
 *  cancelAtPeriodEnd?: (boolean|null)
 * }} input
 */
export async function upsertSubscription({
  email,
  stripeCustomerId = null,
  stripeSubscriptionId,
  stripePriceId = null,
  billingInterval = null,
  domainsLimit = null,
  status = null,
  currentPeriodEnd = null,
  cancelAtPeriodEnd = null,
}) {
  const normalizedEmail = normalizeEmail(email)
  const subscriptionId = String(stripeSubscriptionId ?? "").trim()
  if (!normalizedEmail || !subscriptionId) return null

  if (!hasDb) {
    const now = new Date()
    const previous = fallbackSubscriptions.get(subscriptionId)
    const next = {
      email: normalizedEmail,
      stripe_customer_id: stripeCustomerId ?? previous?.stripe_customer_id ?? null,
      stripe_subscription_id: subscriptionId,
      stripe_price_id: stripePriceId ?? previous?.stripe_price_id ?? null,
      billing_interval: billingInterval ?? previous?.billing_interval ?? null,
      domains_limit: domainsLimit ?? previous?.domains_limit ?? null,
      status: status ?? previous?.status ?? null,
      current_period_end: currentPeriodEnd ?? previous?.current_period_end ?? null,
      cancel_at_period_end:
        cancelAtPeriodEnd ?? previous?.cancel_at_period_end ?? null,
      created_at: previous?.created_at ?? now,
      updated_at: now,
    }
    fallbackSubscriptions.set(subscriptionId, next)
    schedulePersist()
    return next
  }

  await ensureTables()
  const rows = rowsFrom(await sql`
    INSERT INTO dr_subscriptions (
      email,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_price_id,
      billing_interval,
      domains_limit,
      status,
      current_period_end,
      cancel_at_period_end
    )
    VALUES (
      ${normalizedEmail},
      ${stripeCustomerId},
      ${subscriptionId},
      ${stripePriceId},
      ${billingInterval},
      ${domainsLimit},
      ${status},
      ${currentPeriodEnd},
      ${cancelAtPeriodEnd}
    )
    ON CONFLICT (stripe_subscription_id)
    DO UPDATE SET
      email = COALESCE(EXCLUDED.email, dr_subscriptions.email),
      stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, dr_subscriptions.stripe_customer_id),
      stripe_price_id = COALESCE(EXCLUDED.stripe_price_id, dr_subscriptions.stripe_price_id),
      billing_interval = COALESCE(EXCLUDED.billing_interval, dr_subscriptions.billing_interval),
      domains_limit = COALESCE(EXCLUDED.domains_limit, dr_subscriptions.domains_limit),
      status = COALESCE(EXCLUDED.status, dr_subscriptions.status),
      current_period_end = COALESCE(EXCLUDED.current_period_end, dr_subscriptions.current_period_end),
      cancel_at_period_end = COALESCE(EXCLUDED.cancel_at_period_end, dr_subscriptions.cancel_at_period_end),
      updated_at = NOW()
    RETURNING
      email,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_price_id,
      billing_interval,
      domains_limit,
      status,
      current_period_end,
      cancel_at_period_end,
      created_at,
      updated_at
  `)
  return rows[0] || null
}

/**
 * Fetch the most recent active subscription for an email.
 * @param {string} email
 */
export async function getActiveSubscriptionByEmail(email) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) return null

  if (!hasDb) {
    const matches = Array.from(fallbackSubscriptions.values()).filter(
      (row) => row.email === normalizedEmail && ["active", "trialing"].includes(row.status)
    )
    if (!matches.length) return null
    matches.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    return matches[0] || null
  }

  await ensureTables()
  const rows = rowsFrom(await sql`
    SELECT
      email,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_price_id,
      billing_interval,
      domains_limit,
      status,
      current_period_end,
      cancel_at_period_end,
      created_at,
      updated_at
    FROM dr_subscriptions
    WHERE email = ${normalizedEmail}
      AND status IN ('active', 'trialing')
      AND (current_period_end IS NULL OR current_period_end > NOW())
    ORDER BY updated_at DESC
    LIMIT 1
  `)
  return rows[0] || null
}

/**
 * Fetch the most recent subscription for an email (any status).
 * @param {string} email
 */
export async function getLatestSubscriptionByEmail(email) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) return null

  if (!hasDb) {
    const matches = Array.from(fallbackSubscriptions.values()).filter((row) => row.email === normalizedEmail)
    if (!matches.length) return null
    matches.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    return matches[0] || null
  }

  await ensureTables()
  const rows = rowsFrom(await sql`
    SELECT
      email,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_price_id,
      billing_interval,
      domains_limit,
      status,
      current_period_end,
      cancel_at_period_end,
      created_at,
      updated_at
    FROM dr_subscriptions
    WHERE email = ${normalizedEmail}
    ORDER BY updated_at DESC
    LIMIT 1
  `)
  return rows[0] || null
}

/**
 * List subscriptions for reporting.
 * @param {{ email?: string, limit?: number, offset?: number }} [opts]
 */
export async function listSubscriptions(opts = {}) {
  const email = opts?.email ? normalizeEmail(opts.email) : null
  const limit = Number.isFinite(opts.limit) ? Math.max(1, Math.min(200, opts.limit)) : 100
  const offset = Number.isFinite(opts.offset) ? Math.max(0, opts.offset) : 0

  if (!hasDb) {
    let rows = Array.from(fallbackSubscriptions.values())
    if (email) rows = rows.filter((row) => row.email === email)
    rows.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    return rows.slice(offset, offset + limit)
  }

  await ensureTables()
  const rows = rowsFrom(await sql`
    SELECT
      email,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_price_id,
      billing_interval,
      domains_limit,
      status,
      current_period_end,
      cancel_at_period_end,
      created_at,
      updated_at
    FROM dr_subscriptions
    WHERE ${email === null} OR email = ${email}
    ORDER BY updated_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `)
  return rows
}

/**
 * Insert a billing audit log entry.
 * @param {{
 *  stripeEventId?: (string|null),
 *  stripeEventType: string,
 *  stripeCustomerId?: (string|null),
 *  stripeSubscriptionId?: (string|null),
 *  stripePriceId?: (string|null),
 *  email?: (string|null),
 *  billingInterval?: (string|null),
 *  domainsLimit?: (number|null),
 *  status?: (string|null),
 *  currentPeriodEnd?: (Date|null),
 *  cancelAtPeriodEnd?: (boolean|null),
 *  eventCreatedAt?: (Date|null),
 *  success?: boolean,
 *  error?: (string|null)
 * }} input
 */
export async function insertBillingAudit({
  stripeEventId = null,
  stripeEventType,
  stripeCustomerId = null,
  stripeSubscriptionId = null,
  stripePriceId = null,
  email = null,
  billingInterval = null,
  domainsLimit = null,
  status = null,
  currentPeriodEnd = null,
  cancelAtPeriodEnd = null,
  eventCreatedAt = null,
  success = true,
  error = null,
}) {
  if (!stripeEventType) return null

  if (!hasDb) {
    const createdAt = new Date()
    const entry = {
      stripe_event_id: stripeEventId ?? null,
      stripe_event_type: stripeEventType,
      stripe_customer_id: stripeCustomerId ?? null,
      stripe_subscription_id: stripeSubscriptionId ?? null,
      stripe_price_id: stripePriceId ?? null,
      email: email ? normalizeEmail(email) : null,
      billing_interval: billingInterval ?? null,
      domains_limit: Number.isFinite(Number(domainsLimit)) ? Number(domainsLimit) : null,
      status: status ?? null,
      current_period_end: currentPeriodEnd ?? null,
      cancel_at_period_end:
        typeof cancelAtPeriodEnd === "boolean" ? cancelAtPeriodEnd : null,
      event_created_at: eventCreatedAt ?? null,
      success: typeof success === "boolean" ? success : true,
      error: error ?? null,
      created_at: createdAt,
    }
    fallbackBillingAudit.push(entry)
    if (fallbackBillingAudit.length > 500) fallbackBillingAudit.splice(0, fallbackBillingAudit.length - 500)
    schedulePersist()
    return entry
  }

  await ensureTables()
  const rows = rowsFrom(await sql`
    INSERT INTO dr_billing_audit (
      stripe_event_id,
      stripe_event_type,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_price_id,
      email,
      billing_interval,
      domains_limit,
      status,
      current_period_end,
      cancel_at_period_end,
      event_created_at,
      success,
      error
    )
    VALUES (
      ${stripeEventId},
      ${stripeEventType},
      ${stripeCustomerId},
      ${stripeSubscriptionId},
      ${stripePriceId},
      ${email ? normalizeEmail(email) : null},
      ${billingInterval},
      ${domainsLimit},
      ${status},
      ${currentPeriodEnd},
      ${cancelAtPeriodEnd},
      ${eventCreatedAt},
      ${success},
      ${error}
    )
    ON CONFLICT (stripe_event_id)
    DO UPDATE SET
      stripe_event_type = EXCLUDED.stripe_event_type,
      stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, dr_billing_audit.stripe_customer_id),
      stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, dr_billing_audit.stripe_subscription_id),
      stripe_price_id = COALESCE(EXCLUDED.stripe_price_id, dr_billing_audit.stripe_price_id),
      email = COALESCE(EXCLUDED.email, dr_billing_audit.email),
      billing_interval = COALESCE(EXCLUDED.billing_interval, dr_billing_audit.billing_interval),
      domains_limit = COALESCE(EXCLUDED.domains_limit, dr_billing_audit.domains_limit),
      status = COALESCE(EXCLUDED.status, dr_billing_audit.status),
      current_period_end = COALESCE(EXCLUDED.current_period_end, dr_billing_audit.current_period_end),
      cancel_at_period_end = COALESCE(EXCLUDED.cancel_at_period_end, dr_billing_audit.cancel_at_period_end),
      event_created_at = COALESCE(EXCLUDED.event_created_at, dr_billing_audit.event_created_at),
      success = COALESCE(EXCLUDED.success, dr_billing_audit.success),
      error = COALESCE(EXCLUDED.error, dr_billing_audit.error),
      created_at = NOW()
    RETURNING
      stripe_event_id,
      stripe_event_type,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_price_id,
      email,
      billing_interval,
      domains_limit,
      status,
      current_period_end,
      cancel_at_period_end,
      event_created_at,
      success,
      error,
      created_at
  `)
  return rows[0] || null
}

/**
 * Fetch the most recent billing audit event.
 * @param {{ success?: (boolean|null) }} [opts]
 */
export async function getLatestBillingAuditEvent(opts = {}) {
  const success = typeof opts?.success === "boolean" ? opts.success : null

  if (!hasDb) {
    const rows =
      success === null ? [...fallbackBillingAudit] : fallbackBillingAudit.filter((row) => row.success === success)
    if (!rows.length) return null
    rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return rows[0] || null
  }

  await ensureTables()
  const rows = rowsFrom(await sql`
    SELECT
      stripe_event_id,
      stripe_event_type,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_price_id,
      email,
      billing_interval,
      domains_limit,
      status,
      current_period_end,
      cancel_at_period_end,
      event_created_at,
      success,
      error,
      created_at
    FROM dr_billing_audit
    WHERE ${success === null} OR success = ${success}
    ORDER BY created_at DESC
    LIMIT 1
  `)
  return rows[0] || null
}

export async function getLatestBillingAuditFailure() {
  return getLatestBillingAuditEvent({ success: false })
}

/**
 * Remove billing audit entries older than the provided number of days.
 * @param {{ olderThanDays?: number }} [opts]
 */
export async function pruneBillingAudit(opts = {}) {
  const days = Number.isFinite(opts?.olderThanDays) ? Math.max(1, Math.floor(opts.olderThanDays)) : 180
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  if (!hasDb) {
    const before = fallbackBillingAudit.length
    const remaining = fallbackBillingAudit.filter((row) => {
      const createdAt = row.created_at instanceof Date ? row.created_at : new Date(row.created_at)
      return Number.isFinite(createdAt.getTime()) && createdAt >= cutoff
    })
    fallbackBillingAudit.splice(0, fallbackBillingAudit.length, ...remaining)
    if (before !== fallbackBillingAudit.length) schedulePersist()
    return { removed: before - fallbackBillingAudit.length, cutoff }
  }

  await ensureTables()
  const result = await sql`
    DELETE FROM dr_billing_audit
    WHERE created_at < ${cutoff}
  `
  const removed = Number(result?.rowCount ?? result?.count ?? 0)
  return { removed, cutoff }
}
