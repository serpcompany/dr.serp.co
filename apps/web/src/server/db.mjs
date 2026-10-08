import { getCloudflareContext } from '@opennextjs/cloudflare'
import { isValidDomainTarget } from './domain-target.mjs'
import { isSpamSite } from './site-spam.mjs'

const D1_BINDING_NAME = 'DB'

/**
 * Number.isFinite, as a type guard.
 * @param {unknown} value
 * @returns {value is number}
 */
function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function canUseFallbackStore() {
  return process.env.NODE_ENV !== 'production'
}

/**
 * @returns {never}
 */
function persistentDatabaseUnavailable() {
  throw new Error(
    `Persistent database is not configured. Bind ${D1_BINDING_NAME} before serving production traffic.`
  )
}

function getD1Database() {
  try {
    const context = getCloudflareContext()
    if (!context?.env) return null
    const binding = context.env[D1_BINDING_NAME]
    if (!binding) {
      throw new Error(`Cloudflare binding ${D1_BINDING_NAME} is not configured.`)
    }
    if (typeof binding.prepare !== 'function') {
      throw new Error(`Cloudflare binding ${D1_BINDING_NAME} is not a D1 database.`)
    }
    return binding
  } catch (error) {
    if (error instanceof Error && error.message.includes(D1_BINDING_NAME)) throw error
    return null
  }
}

// In dev/local runs, a database is often not configured. Keep a global in-memory fallback so
// checked domains still appear on /sites during the session (even across webpack bundles).
const fallbackStoreKey = '__dr_serp_fallback_store__'
const globalStore = /** @type {any} */ (globalThis)
if (!globalStore[fallbackStoreKey]) {
  globalStore[fallbackStoreKey] = {
    claims: new Map(),
    checks: new Map(),
    subscriptions: new Map(),
    billingAudit: []
  }
}
/** @type {{ claims: Map<string, any>, checks: Map<string, any>, subscriptions: Map<string, any>, billingAudit: Array<any> }} */
const fallbackStore = globalStore[fallbackStoreKey]

/** @type {Map<string, {domain: string, email: (string|null), domain_rating: (number|null), provider: (string|null), site_title: (string|null), meta_description: (string|null), site_url: (string|null), screenshot_url: (string|null), claimed_at: Date, updated_at: Date}>} */
const fallbackClaims = fallbackStore.claims
/** @type {Map<string, Array<{domain_rating: number, provider: (string|null), checked_at: Date}>>} */
const fallbackChecks = fallbackStore.checks
/** @type {Map<string, any>} */
const fallbackSubscriptions = fallbackStore.subscriptions
/** @type {Array<any>} */
const fallbackBillingAudit = fallbackStore.billingAudit

const persistDir = `${process.cwd()}/.cache`
const persistPath = `${persistDir}/dr-fallback.json`
const persistTimerKey = '__dr_serp_fallback_persist_timer__'

async function hydrateFromDisk() {
  if (!canUseFallbackStore()) return
  try {
    const fs = await import('node:fs/promises')
    const raw = await fs.readFile(persistPath, 'utf8').catch(error => {
      if (error?.code === 'ENOENT') return ''
      throw error
    })
    if (!raw) return
    const parsed = JSON.parse(raw)

    const claims = Array.isArray(parsed?.claims) ? parsed.claims : []
    for (const row of claims) {
      const domain = String(row?.domain ?? '').trim()
      if (!domain) continue
      const claimedAt = row?.claimed_at ? new Date(row.claimed_at) : new Date()
      const updatedAt = row?.updated_at ? new Date(row.updated_at) : new Date()
      fallbackClaims.set(domain, {
        domain,
        email: row?.email ?? null,
        domain_rating: typeof row?.domain_rating === 'number' ? row.domain_rating : null,
        provider: row?.provider ?? null,
        site_title: row?.site_title ?? null,
        meta_description: row?.meta_description ?? null,
        site_url: row?.site_url ?? null,
        screenshot_url: row?.screenshot_url ?? null,
        claimed_at: Number.isFinite(claimedAt.getTime()) ? claimedAt : new Date(),
        updated_at: Number.isFinite(updatedAt.getTime()) ? updatedAt : new Date()
      })
    }

    const checks = parsed?.checks && typeof parsed.checks === 'object' ? parsed.checks : {}
    for (const [domain, list] of Object.entries(checks)) {
      if (!Array.isArray(list)) continue
      const normalizedDomain = String(domain ?? '').trim()
      if (!normalizedDomain) continue
      const next = []
      for (const item of list) {
        const dr = clampDr(item?.domain_rating)
        if (dr === null) continue
        const checkedAt = item?.checked_at ? new Date(item.checked_at) : new Date()
        next.push({
          domain_rating: dr,
          provider: item?.provider ?? null,
          checked_at: Number.isFinite(checkedAt.getTime()) ? checkedAt : new Date()
        })
      }
      if (next.length) fallbackChecks.set(normalizedDomain, next)
    }

    const subscriptions = Array.isArray(parsed?.subscriptions) ? parsed.subscriptions : []
    for (const row of subscriptions) {
      const subscriptionId = String(row?.stripe_subscription_id ?? '').trim()
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
        current_period_end: Number.isFinite(currentPeriodEnd?.getTime()) ? currentPeriodEnd : null,
        cancel_at_period_end:
          typeof row?.cancel_at_period_end === 'boolean' ? row.cancel_at_period_end : null,
        created_at: Number.isFinite(createdAt.getTime()) ? createdAt : new Date(),
        updated_at: Number.isFinite(updatedAt.getTime()) ? updatedAt : new Date()
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
        domains_limit: Number.isFinite(Number(row?.domains_limit))
          ? Number(row.domains_limit)
          : null,
        status: row?.status ?? null,
        current_period_end: Number.isFinite(currentPeriodEnd?.getTime()) ? currentPeriodEnd : null,
        cancel_at_period_end:
          typeof row?.cancel_at_period_end === 'boolean' ? row.cancel_at_period_end : null,
        event_created_at: Number.isFinite(eventCreatedAt?.getTime()) ? eventCreatedAt : null,
        success: typeof row?.success === 'boolean' ? row.success : true,
        error: row?.error ?? null,
        created_at: Number.isFinite(createdAt.getTime()) ? createdAt : new Date()
      })
    }
  } catch {
    // ignore
  }
}

function schedulePersist() {
  if (!canUseFallbackStore()) return
  if (globalStore[persistTimerKey]) return

  globalStore[persistTimerKey] = setTimeout(async () => {
    globalStore[persistTimerKey] = null
    try {
      const fs = await import('node:fs/promises')
      await fs.mkdir(persistDir, { recursive: true })

      const claims = Array.from(fallbackClaims.values()).map(row => ({
        domain: row.domain,
        email: row.email ?? null,
        domain_rating: typeof row.domain_rating === 'number' ? row.domain_rating : null,
        provider: row.provider ?? null,
        site_title: row.site_title ?? null,
        meta_description: row.meta_description ?? null,
        site_url: row.site_url ?? null,
        screenshot_url: row.screenshot_url ?? null,
        claimed_at: row.claimed_at instanceof Date ? row.claimed_at.toISOString() : null,
        updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : null
      }))

      const checks = {}
      for (const [domain, list] of fallbackChecks.entries()) {
        checks[domain] = list.map(item => ({
          domain_rating: item.domain_rating,
          provider: item.provider ?? null,
          checked_at: item.checked_at instanceof Date ? item.checked_at.toISOString() : null
        }))
      }

      const subscriptions = Array.from(fallbackSubscriptions.values()).map(row => ({
        email: row.email,
        stripe_customer_id: row.stripe_customer_id ?? null,
        stripe_subscription_id: row.stripe_subscription_id,
        stripe_price_id: row.stripe_price_id ?? null,
        billing_interval: row.billing_interval ?? null,
        domains_limit: row.domains_limit ?? null,
        status: row.status ?? null,
        current_period_end:
          row.current_period_end instanceof Date ? row.current_period_end.toISOString() : null,
        cancel_at_period_end: row.cancel_at_period_end ?? null,
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : null,
        updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : null
      }))

      const billingAudit = fallbackBillingAudit.slice(-250).map(row => ({
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
          row.current_period_end instanceof Date ? row.current_period_end.toISOString() : null,
        cancel_at_period_end: row.cancel_at_period_end ?? null,
        event_created_at:
          row.event_created_at instanceof Date ? row.event_created_at.toISOString() : null,
        success: typeof row.success === 'boolean' ? row.success : true,
        error: row.error ?? null,
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : null
      }))

      await fs.writeFile(
        persistPath,
        JSON.stringify({ claims, checks, subscriptions, billingAudit }, null, 2)
      )
    } catch {
      // ignore
    }
  }, 250)
}

await hydrateFromDisk()

function clampDr(value) {
  const dr = Math.max(0, Math.min(100, Math.floor(Number(value))))
  return Number.isFinite(dr) ? dr : null
}

function coerceDate(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date : null
  }
  return null
}

/**
 * @param {unknown} value
 * @param {string|null} [fallback]
 */
function isoText(value, fallback = null) {
  const date = coerceDate(value)
  return date ? date.toISOString() : fallback
}

function nowIsoText() {
  return new Date().toISOString()
}

function toD1Boolean(value) {
  return typeof value === 'boolean' ? (value ? 1 : 0) : null
}

function fromD1Boolean(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value !== '0' && value.toLowerCase() !== 'false'
  return Boolean(value)
}

function normalizeD1SubscriptionRow(row) {
  if (!row) return null
  return {
    ...row,
    cancel_at_period_end: fromD1Boolean(row.cancel_at_period_end)
  }
}

function normalizeD1BillingAuditRow(row) {
  if (!row) return null
  return {
    ...row,
    cancel_at_period_end: fromD1Boolean(row.cancel_at_period_end),
    success: fromD1Boolean(row.success)
  }
}

function isListableSiteRow(row) {
  return (
    isValidDomainTarget(row?.domain) &&
    !isSpamSite({ domain: row?.domain, siteTitle: row?.site_title })
  )
}

function filterListableSiteRows(rows) {
  return rows.filter(isListableSiteRow)
}

const MAX_SEARCH_LENGTH = 100
// Deeper pages answer empty, so an unbounded offset never reaches SQL, where D1 refuses a value
// past 64 bits.
const MAX_LIST_OFFSET = 100_000
// Rows past the requested page that listSites reads first, so a page stays full when some stored
// rows are unlistable (invalid or spam). When more than that precede the page, it reads further.
const LISTABLE_SCAN_SLACK = 200

function clampOffset(value) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

// SQLite's lower() folds only ASCII, so fold only ASCII here too.
function asciiLower(value) {
  return String(value ?? '').replace(/[A-Z]/g, char => char.toLowerCase())
}

/**
 * Normalize a site search: collapse whitespace, keep at most 100 characters, fold ASCII case.
 * Queries match with instr(), never LIKE: D1 refuses LIKE patterns over 50 bytes.
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeSearchQuery(value) {
  const collapsed = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!collapsed) return null
  const capped = Array.from(collapsed).slice(0, MAX_SEARCH_LENGTH).join('').trim()
  return asciiLower(capped)
}

function domainMatches(domain, q) {
  return !q || asciiLower(domain).includes(q)
}

// Invalid domains are always purged; spam is purged only while unclaimed so a claim is never silently deleted.
function isPurgeableSiteRow(row) {
  const domain = String(row?.domain ?? '')
    .trim()
    .toLowerCase()
  if (!domain) return false
  if (!isValidDomainTarget(domain)) return true
  return !row?.email && isSpamSite({ domain, siteTitle: row?.site_title })
}

function rowsFrom(result) {
  if (!result) return []
  if (Array.isArray(result)) return result
  if (Array.isArray(result.rows)) return result.rows
  if (Array.isArray(result.results)) return result.results
  return []
}

function d1Statement(db, sqlText, params = []) {
  const statement = db.prepare(sqlText)
  return params.length ? statement.bind(...params) : statement
}

async function d1Run(db, sqlText, params = []) {
  return d1Statement(db, sqlText, params).run()
}

async function d1Rows(db, sqlText, params = []) {
  return rowsFrom(await d1Run(db, sqlText, params))
}

async function d1First(db, sqlText, params = []) {
  return d1Statement(db, sqlText, params).first()
}

async function d1Batch(db, statements) {
  if (typeof db.batch === 'function') return db.batch(statements)
  const results = []
  for (const statement of statements) {
    results.push(await statement.run())
  }
  return results
}

/**
 * @param {string} domain
 */
export async function getClaim(domain) {
  const d1 = getD1Database()
  if (d1) {
    return (
      (await d1First(
        d1,
        `
          SELECT domain, email, domain_rating, provider, site_title, meta_description, site_url, screenshot_url, claimed_at, updated_at
          FROM dr_claims
          WHERE domain = ?
          LIMIT 1
        `,
        [domain]
      )) || null
    )
  }

  if (canUseFallbackStore()) {
    const row = fallbackClaims.get(domain)
    return row || null
  }

  return persistentDatabaseUnavailable()
}

/**
 * @param {{ domain: string, email?: (string|null), domainRating: number, provider?: (string|null) }} input
 */
export async function upsertClaim({ domain, email = null, domainRating, provider = null }) {
  const d1 = getD1Database()
  if (d1) {
    const now = nowIsoText()
    return (
      (await d1First(
        d1,
        `
          INSERT INTO dr_claims (domain, email, domain_rating, provider, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (domain)
          DO UPDATE SET
            email = COALESCE(excluded.email, dr_claims.email),
            domain_rating = excluded.domain_rating,
            provider = excluded.provider,
            updated_at = excluded.updated_at
          RETURNING domain, email, domain_rating, provider, site_title, meta_description, site_url, screenshot_url, claimed_at, updated_at
        `,
        [domain, email, clampDr(domainRating), provider, now]
      )) || null
    )
  }

  if (canUseFallbackStore()) {
    const now = new Date()
    const previous = fallbackClaims.get(domain)
    const claimedAt = previous?.claimed_at || now
    const next = {
      domain,
      email: email ?? previous?.email ?? null,
      domain_rating: clampDr(domainRating),
      provider: provider ?? null,
      site_title: previous?.site_title ?? null,
      meta_description: previous?.meta_description ?? null,
      site_url: previous?.site_url ?? null,
      screenshot_url: previous?.screenshot_url ?? null,
      claimed_at: claimedAt,
      updated_at: now
    }
    fallbackClaims.set(domain, next)
    schedulePersist()
    return next
  }

  return persistentDatabaseUnavailable()
}

/**
 * Associate a domain with an email without overwriting the DR/provider.
 * Never takes over a domain claimed by a different email; returns null in that case.
 * @param {{ domain: string, email: string }} input
 */
export async function setClaimEmail({ domain, email }) {
  const d1 = getD1Database()
  if (d1) {
    const now = nowIsoText()
    return (
      (await d1First(
        d1,
        `
          INSERT INTO dr_claims (domain, email, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT (domain)
          DO UPDATE SET
            email = excluded.email,
            updated_at = excluded.updated_at
          WHERE dr_claims.email IS NULL OR lower(dr_claims.email) = lower(excluded.email)
          RETURNING domain, email, domain_rating, provider, site_title, meta_description, site_url, screenshot_url, claimed_at, updated_at
        `,
        [domain, email, now]
      )) || null
    )
  }

  if (canUseFallbackStore()) {
    const now = new Date()
    const previous = fallbackClaims.get(domain)
    const previousEmail = String(previous?.email ?? '')
      .trim()
      .toLowerCase()
    if (
      previousEmail &&
      previousEmail !==
        String(email ?? '')
          .trim()
          .toLowerCase()
    )
      return null
    const claimedAt = previous?.claimed_at || now
    const next = {
      domain,
      email,
      domain_rating: previous?.domain_rating ?? null,
      provider: previous?.provider ?? null,
      site_title: previous?.site_title ?? null,
      meta_description: previous?.meta_description ?? null,
      site_url: previous?.site_url ?? null,
      screenshot_url: previous?.screenshot_url ?? null,
      claimed_at: claimedAt,
      updated_at: now
    }
    fallbackClaims.set(domain, next)
    schedulePersist()
    return next
  }

  return persistentDatabaseUnavailable()
}

/**
 * Remove a claim's email association if it matches the provided email.
 * Keeps the domain + DR data intact (so it can still appear in /sites).
 * @param {{ domain: string, email: string }} input
 */
export async function clearClaimEmail({ domain, email }) {
  const normalizedDomain = String(domain ?? '').trim()
  const normalizedEmail = String(email ?? '')
    .trim()
    .toLowerCase()
  if (!normalizedDomain || !normalizedEmail) return null

  const d1 = getD1Database()
  if (d1) {
    return (
      (await d1First(
        d1,
        `
          UPDATE dr_claims
          SET email = NULL, updated_at = ?
          WHERE domain = ? AND lower(email) = ?
          RETURNING domain, email, domain_rating, provider, site_title, meta_description, site_url, screenshot_url, claimed_at, updated_at
        `,
        [nowIsoText(), normalizedDomain, normalizedEmail]
      )) || null
    )
  }

  if (canUseFallbackStore()) {
    const previous = fallbackClaims.get(normalizedDomain)
    if (!previous) return null
    if (
      String(previous.email ?? '')
        .trim()
        .toLowerCase() !== normalizedEmail
    )
      return previous
    const now = new Date()
    const next = {
      ...previous,
      email: null,
      updated_at: now
    }
    fallbackClaims.set(normalizedDomain, next)
    schedulePersist()
    return next
  }

  return persistentDatabaseUnavailable()
}

/**
 * Ensure a domain exists in storage even if DR cannot be fetched yet.
 * This keeps /sites from showing "No domains" after a user visits a domain page.
 * @param {string} domain
 */
export async function touchDomain(domain) {
  const normalized = String(domain ?? '').trim()
  if (!normalized) return null

  const d1 = getD1Database()
  if (d1) {
    const now = nowIsoText()
    return (
      (await d1First(
        d1,
        `
          INSERT INTO dr_claims (domain, updated_at)
          VALUES (?, ?)
          ON CONFLICT (domain)
          DO UPDATE SET
            updated_at = excluded.updated_at
          RETURNING domain, email, domain_rating, provider, site_title, meta_description, site_url, screenshot_url, claimed_at, updated_at
        `,
        [normalized, now]
      )) || null
    )
  }

  if (canUseFallbackStore()) {
    const now = new Date()
    const previous = fallbackClaims.get(normalized)
    const claimedAt = previous?.claimed_at || now
    const next = {
      domain: normalized,
      email: previous?.email ?? null,
      domain_rating: previous?.domain_rating ?? null,
      provider: previous?.provider ?? null,
      site_title: previous?.site_title ?? null,
      meta_description: previous?.meta_description ?? null,
      site_url: previous?.site_url ?? null,
      screenshot_url: previous?.screenshot_url ?? null,
      claimed_at: claimedAt,
      updated_at: now
    }
    fallbackClaims.set(normalized, next)
    schedulePersist()
    return next
  }

  return persistentDatabaseUnavailable()
}

/**
 * Persist site presentation metadata for a domain.
 * @param {{
 *  domain: string,
 *  siteTitle?: (string|null),
 *  metaDescription?: (string|null),
 *  siteUrl?: (string|null),
 *  screenshotUrl?: (string|null)
 * }} input
 */
export async function setClaimSiteMetadata({
  domain,
  siteTitle = null,
  metaDescription = null,
  siteUrl = null,
  screenshotUrl = null
}) {
  const normalizedDomain = String(domain ?? '').trim()
  if (!normalizedDomain) return null

  const d1 = getD1Database()
  if (d1) {
    const now = nowIsoText()
    return (
      (await d1First(
        d1,
        `
          INSERT INTO dr_claims (domain, site_title, meta_description, site_url, screenshot_url, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (domain)
          DO UPDATE SET
            site_title = COALESCE(excluded.site_title, dr_claims.site_title),
            meta_description = COALESCE(excluded.meta_description, dr_claims.meta_description),
            site_url = COALESCE(excluded.site_url, dr_claims.site_url),
            screenshot_url = COALESCE(excluded.screenshot_url, dr_claims.screenshot_url),
            updated_at = excluded.updated_at
          RETURNING domain, email, domain_rating, provider, site_title, meta_description, site_url, screenshot_url, claimed_at, updated_at
        `,
        [normalizedDomain, siteTitle, metaDescription, siteUrl, screenshotUrl, now]
      )) || null
    )
  }

  if (canUseFallbackStore()) {
    const now = new Date()
    const previous = fallbackClaims.get(normalizedDomain)
    const claimedAt = previous?.claimed_at || now
    const next = {
      domain: normalizedDomain,
      email: previous?.email ?? null,
      domain_rating: previous?.domain_rating ?? null,
      provider: previous?.provider ?? null,
      site_title: siteTitle ?? previous?.site_title ?? null,
      meta_description: metaDescription ?? previous?.meta_description ?? null,
      site_url: siteUrl ?? previous?.site_url ?? null,
      screenshot_url: screenshotUrl ?? previous?.screenshot_url ?? null,
      claimed_at: claimedAt,
      updated_at: now
    }
    fallbackClaims.set(normalizedDomain, next)
    schedulePersist()
    return next
  }

  return persistentDatabaseUnavailable()
}

/**
 * Record a DR check point for charting.
 * @param {{ domain: string, domainRating: number, provider?: (string|null), checkedAt?: (Date|null) }} input
 */
export async function recordDrCheck({ domain, domainRating, provider = null, checkedAt = null }) {
  const d1 = getD1Database()
  if (d1) {
    const safeRating = clampDr(domainRating)
    if (safeRating === null) return null
    return (
      (await d1First(
        d1,
        `
          INSERT INTO dr_checks (domain, domain_rating, provider, checked_at)
          VALUES (?, ?, ?, ?)
          RETURNING id, domain, domain_rating, provider, checked_at
        `,
        [domain, safeRating, provider, isoText(checkedAt, nowIsoText())]
      )) || null
    )
  }

  if (canUseFallbackStore()) {
    const safeRating = clampDr(domainRating)
    if (safeRating === null) return null
    const list = fallbackChecks.get(domain) || []
    const next = {
      domain_rating: safeRating,
      provider: provider ?? null,
      checked_at: checkedAt instanceof Date ? checkedAt : new Date()
    }
    list.push(next)
    list.sort((a, b) => a.checked_at.getTime() - b.checked_at.getTime())
    // Keep memory bounded similar to SQL limit cap.
    if (list.length > 365) list.splice(0, list.length - 365)
    fallbackChecks.set(domain, list)
    schedulePersist()
    return { id: null, domain, ...next }
  }

  return persistentDatabaseUnavailable()
}

/**
 * Record historical DR check points for charting.
 * Replaces exact duplicate (domain, provider, checked_at) rows instead of appending forever.
 * @param {{ domain: string, points: Array<{ domainRating?: number, domain_rating?: number, checkedAt?: (Date|string|null), checked_at?: (Date|string|null), provider?: (string|null) }>, provider?: (string|null) }} input
 */
export async function recordDrHistoryChecks({ domain, points, provider = 'ahrefs-history' }) {
  const normalizedDomain = String(domain ?? '').trim()
  if (!normalizedDomain || !Array.isArray(points) || points.length === 0) return []

  const normalizedPoints = points
    .map(point => {
      const safeRating = clampDr(point?.domainRating ?? point?.domain_rating)
      const checkedAt = coerceDate(point?.checkedAt ?? point?.checked_at)
      if (safeRating === null || !checkedAt) return null
      return {
        domain_rating: safeRating,
        provider: point?.provider ?? provider ?? null,
        checked_at: checkedAt
      }
    })
    .filter(point => point !== null)

  if (normalizedPoints.length === 0) return []

  const d1 = getD1Database()
  if (d1) {
    const recorded = []
    for (const point of normalizedPoints) {
      const checkedAt = point.checked_at.toISOString()
      const results = await d1Batch(d1, [
        d1Statement(
          d1,
          `
            DELETE FROM dr_checks
            WHERE domain = ?
              AND ((provider IS NULL AND ? IS NULL) OR provider = ?)
              AND checked_at = ?
          `,
          [normalizedDomain, point.provider, point.provider, checkedAt]
        ),
        d1Statement(
          d1,
          `
            INSERT INTO dr_checks (domain, domain_rating, provider, checked_at)
            VALUES (?, ?, ?, ?)
            RETURNING id, domain, domain_rating, provider, checked_at
          `,
          [normalizedDomain, point.domain_rating, point.provider, checkedAt]
        )
      ])
      const row = rowsFrom(results?.[1])[0] || null
      if (row) recorded.push(row)
    }
    return recorded
  }

  if (canUseFallbackStore()) {
    const list = fallbackChecks.get(normalizedDomain) || []
    for (const point of normalizedPoints) {
      const checkedAtMs = point.checked_at.getTime()
      const existingIndex = list.findIndex(
        item =>
          (item.provider ?? null) === (point.provider ?? null) &&
          item.checked_at instanceof Date &&
          item.checked_at.getTime() === checkedAtMs
      )
      const next = {
        domain_rating: point.domain_rating,
        provider: point.provider ?? null,
        checked_at: point.checked_at
      }
      if (existingIndex >= 0) {
        list[existingIndex] = next
      } else {
        list.push(next)
      }
    }
    list.sort((a, b) => a.checked_at.getTime() - b.checked_at.getTime())
    if (list.length > 365) list.splice(0, list.length - 365)
    fallbackChecks.set(normalizedDomain, list)
    schedulePersist()
    return normalizedPoints.map(point => ({
      id: null,
      domain: normalizedDomain,
      ...point
    }))
  }

  return persistentDatabaseUnavailable()
}

/**
 * Fetch recent DR checks for a domain.
 * @param {string} domain
 * @param {{ limit?: number }} [opts]
 */
export async function getDrChecks(domain, opts = {}) {
  const d1 = getD1Database()
  if (d1) {
    const limit = isFiniteNumber(opts.limit) ? Math.max(1, Math.min(365, opts.limit)) : 60
    const rows = await d1Rows(
      d1,
      `
        SELECT domain_rating, provider, checked_at
        FROM dr_checks
        WHERE domain = ?
        ORDER BY checked_at DESC
        LIMIT ?
      `,
      [domain, limit]
    )
    return rows.reverse()
  }

  if (canUseFallbackStore()) {
    const list = fallbackChecks.get(domain) || []
    const limit = isFiniteNumber(opts.limit) ? Math.max(1, Math.min(365, opts.limit)) : 60
    const sorted = list.slice().sort((a, b) => a.checked_at.getTime() - b.checked_at.getTime())
    return sorted.slice(Math.max(0, sorted.length - limit))
  }

  return persistentDatabaseUnavailable()
}

/**
 * List DR check rows for migration/export tooling.
 * @param {{ domain?: string, limit?: number, offset?: number }} [opts]
 */
export async function listDrChecks(opts = {}) {
  const domain = String(opts?.domain ?? '').trim() || null
  const limit = isFiniteNumber(opts.limit) ? Math.max(1, Math.min(1000, opts.limit)) : 500
  const offset = isFiniteNumber(opts.offset) ? Math.max(0, opts.offset) : 0

  const d1 = getD1Database()
  if (d1) {
    return d1Rows(
      d1,
      `
        SELECT domain, domain_rating, provider, checked_at
        FROM dr_checks
        WHERE (? IS NULL OR domain = ?)
        ORDER BY checked_at ASC, id ASC
        LIMIT ?
        OFFSET ?
      `,
      [domain, domain, limit, offset]
    )
  }

  if (canUseFallbackStore()) {
    const rows = []
    for (const [checkDomain, list] of fallbackChecks.entries()) {
      if (domain && checkDomain !== domain) continue
      for (const row of list) {
        rows.push({
          domain: checkDomain,
          domain_rating: row.domain_rating,
          provider: row.provider ?? null,
          checked_at: row.checked_at instanceof Date ? row.checked_at.toISOString() : row.checked_at
        })
      }
    }
    rows.sort((a, b) => {
      const dateCompare = String(a.checked_at ?? '').localeCompare(String(b.checked_at ?? ''))
      if (dateCompare) return dateCompare
      return String(a.domain).localeCompare(String(b.domain))
    })
    return rows.slice(offset, offset + limit)
  }

  return persistentDatabaseUnavailable()
}

/**
 * List claimed domains for /sites.
 * @param {{ query?: string, limit?: number, offset?: number, sort?: ("dr"|"updated") }} [opts]
 */
export async function listClaims(opts = {}) {
  const d1 = getD1Database()
  if (d1) {
    const limit = isFiniteNumber(opts.limit) ? Math.max(1, Math.min(100, opts.limit)) : 25
    const offset = clampOffset(opts.offset)
    if (offset > MAX_LIST_OFFSET) return []
    const q = normalizeSearchQuery(opts.query)
    const sort = opts.sort === 'updated' ? 'updated' : 'dr'

    return d1Rows(
      d1,
      sort === 'updated'
        ? `
            SELECT domain, domain_rating, updated_at, site_title, meta_description, site_url, screenshot_url
            FROM dr_claims
            WHERE (? IS NULL OR instr(lower(domain), ?) > 0)
            ORDER BY updated_at IS NULL ASC, updated_at DESC, domain ASC
            LIMIT ?
            OFFSET ?
          `
        : `
            SELECT domain, domain_rating, updated_at, site_title, meta_description, site_url, screenshot_url
            FROM dr_claims
            WHERE (? IS NULL OR instr(lower(domain), ?) > 0)
            ORDER BY domain_rating IS NULL ASC, domain_rating DESC, updated_at IS NULL ASC, updated_at DESC, domain ASC
            LIMIT ?
            OFFSET ?
          `,
      [q, q, limit, offset]
    )
  }

  if (canUseFallbackStore()) {
    const limit = isFiniteNumber(opts.limit) ? Math.max(1, Math.min(100, opts.limit)) : 25
    const offset = clampOffset(opts.offset)
    if (offset > MAX_LIST_OFFSET) return []
    const q = normalizeSearchQuery(opts.query)
    const sort = opts.sort === 'updated' ? 'updated' : 'dr'

    const filtered = Array.from(fallbackClaims.values()).filter(row => domainMatches(row.domain, q))

    const rows = filtered.sort((a, b) => {
      if (sort === 'updated') {
        const diff = b.updated_at.getTime() - a.updated_at.getTime()
        if (diff) return diff
        return a.domain.localeCompare(b.domain)
      }

      const adr = a.domain_rating
      const bdr = b.domain_rating
      const aHas = typeof adr === 'number' && Number.isFinite(adr)
      const bHas = typeof bdr === 'number' && Number.isFinite(bdr)
      if (aHas && bHas && adr !== bdr) return bdr - adr
      if (aHas !== bHas) return aHas ? -1 : 1

      const diff = b.updated_at.getTime() - a.updated_at.getTime()
      if (diff) return diff
      return a.domain.localeCompare(b.domain)
    })

    return rows.slice(offset, offset + limit).map(row => ({
      domain: row.domain,
      domain_rating: row.domain_rating,
      site_title: row.site_title ?? null,
      meta_description: row.meta_description ?? null,
      site_url: row.site_url ?? null,
      screenshot_url: row.screenshot_url ?? null,
      updated_at: row.updated_at.toISOString()
    }))
  }

  return persistentDatabaseUnavailable()
}

/**
 * Count claimed domains for /sites pagination.
 * @param {{ query?: string }} [opts]
 */
export async function countClaims(opts = {}) {
  const d1 = getD1Database()
  if (d1) {
    const q = normalizeSearchQuery(opts.query)
    const row = await d1First(
      d1,
      `
        SELECT COUNT(*) AS count
        FROM dr_claims
        WHERE (? IS NULL OR instr(lower(domain), ?) > 0)
      `,
      [q, q]
    )
    return Number(row?.count) || 0
  }

  if (canUseFallbackStore()) {
    const q = normalizeSearchQuery(opts.query)
    if (!q) return fallbackClaims.size
    let count = 0
    for (const row of fallbackClaims.values()) {
      if (domainMatches(row.domain, q)) count += 1
    }
    return count
  }

  return persistentDatabaseUnavailable()
}

/**
 * List raw claim rows for migration/export tooling.
 * @param {{ limit?: number, offset?: number }} [opts]
 */
export async function listClaimRows(opts = {}) {
  const limit = isFiniteNumber(opts.limit) ? Math.max(1, Math.min(1000, opts.limit)) : 500
  const offset = isFiniteNumber(opts.offset) ? Math.max(0, opts.offset) : 0

  const d1 = getD1Database()
  if (d1) {
    return d1Rows(
      d1,
      `
        SELECT
          domain,
          email,
          domain_rating,
          provider,
          site_title,
          meta_description,
          site_url,
          screenshot_url,
          claimed_at,
          updated_at
        FROM dr_claims
        ORDER BY domain ASC
        LIMIT ?
        OFFSET ?
      `,
      [limit, offset]
    )
  }

  if (canUseFallbackStore()) {
    return Array.from(fallbackClaims.values())
      .slice()
      .sort((a, b) => String(a.domain).localeCompare(String(b.domain)))
      .slice(offset, offset + limit)
      .map(row => ({
        domain: row.domain,
        email: row.email ?? null,
        domain_rating: row.domain_rating ?? null,
        provider: row.provider ?? null,
        site_title: row.site_title ?? null,
        meta_description: row.meta_description ?? null,
        site_url: row.site_url ?? null,
        screenshot_url: row.screenshot_url ?? null,
        claimed_at: row.claimed_at instanceof Date ? row.claimed_at.toISOString() : row.claimed_at,
        updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
      }))
  }

  return persistentDatabaseUnavailable()
}

/**
 * List claimed domains for a specific email.
 * @param {{ email: string, query?: string, limit?: number, offset?: number, sort?: ("dr"|"updated") }} opts
 */
export async function listClaimsByEmail(opts) {
  const email = String(opts?.email ?? '')
    .trim()
    .toLowerCase()
  if (!email) return []

  const d1 = getD1Database()
  if (d1) {
    const limit = isFiniteNumber(opts.limit) ? Math.max(1, Math.min(100, opts.limit)) : 25
    const offset = clampOffset(opts.offset)
    if (offset > MAX_LIST_OFFSET) return []
    const q = normalizeSearchQuery(opts.query)
    const sort = opts.sort === 'updated' ? 'updated' : 'dr'

    return d1Rows(
      d1,
      sort === 'updated'
        ? `
            SELECT domain, domain_rating, updated_at, site_title, meta_description, site_url, screenshot_url
            FROM dr_claims
            WHERE email = ? AND (? IS NULL OR instr(lower(domain), ?) > 0)
            ORDER BY updated_at IS NULL ASC, updated_at DESC, domain ASC
            LIMIT ?
            OFFSET ?
          `
        : `
            SELECT domain, domain_rating, updated_at, site_title, meta_description, site_url, screenshot_url
            FROM dr_claims
            WHERE email = ? AND (? IS NULL OR instr(lower(domain), ?) > 0)
            ORDER BY domain_rating IS NULL ASC, domain_rating DESC, updated_at IS NULL ASC, updated_at DESC, domain ASC
            LIMIT ?
            OFFSET ?
          `,
      [email, q, q, limit, offset]
    )
  }

  if (canUseFallbackStore()) {
    const limit = isFiniteNumber(opts.limit) ? Math.max(1, Math.min(100, opts.limit)) : 25
    const offset = clampOffset(opts.offset)
    if (offset > MAX_LIST_OFFSET) return []
    const q = normalizeSearchQuery(opts.query)
    const sort = opts.sort === 'updated' ? 'updated' : 'dr'

    const filtered = Array.from(fallbackClaims.values()).filter(row => {
      if (
        String(row.email ?? '')
          .trim()
          .toLowerCase() !== email
      )
        return false
      return domainMatches(row.domain, q)
    })

    filtered.sort((a, b) => {
      if (sort === 'updated') {
        const diff = b.updated_at.getTime() - a.updated_at.getTime()
        if (diff) return diff
        return a.domain.localeCompare(b.domain)
      }

      const adr = a.domain_rating
      const bdr = b.domain_rating
      const aHas = typeof adr === 'number' && Number.isFinite(adr)
      const bHas = typeof bdr === 'number' && Number.isFinite(bdr)
      if (aHas && bHas && adr !== bdr) return bdr - adr
      if (aHas !== bHas) return aHas ? -1 : 1

      const diff = b.updated_at.getTime() - a.updated_at.getTime()
      if (diff) return diff
      return a.domain.localeCompare(b.domain)
    })

    return filtered.slice(offset, offset + limit).map(row => ({
      domain: row.domain,
      domain_rating: row.domain_rating,
      site_title: row.site_title ?? null,
      meta_description: row.meta_description ?? null,
      site_url: row.site_url ?? null,
      screenshot_url: row.screenshot_url ?? null,
      updated_at: row.updated_at.toISOString()
    }))
  }

  return persistentDatabaseUnavailable()
}

/**
 * Count claimed domains for a specific email.
 * @param {{ email: string, query?: string }} opts
 */
export async function countClaimsByEmail(opts) {
  const email = String(opts?.email ?? '')
    .trim()
    .toLowerCase()
  if (!email) return 0

  const d1 = getD1Database()
  if (d1) {
    const q = normalizeSearchQuery(opts.query)
    const row = await d1First(
      d1,
      `
        SELECT COUNT(*) AS count
        FROM dr_claims
        WHERE email = ? AND (? IS NULL OR instr(lower(domain), ?) > 0)
      `,
      [email, q, q]
    )
    return Number(row?.count) || 0
  }

  if (canUseFallbackStore()) {
    const q = normalizeSearchQuery(opts.query)
    let count = 0
    for (const row of fallbackClaims.values()) {
      if (
        String(row.email ?? '')
          .trim()
          .toLowerCase() !== email
      )
        continue
      if (!domainMatches(row.domain, q)) continue
      count += 1
    }
    return count
  }

  return persistentDatabaseUnavailable()
}

/**
 * List all domains that have ever been checked (backed by dr_checks).
 * @param {{ query?: string, limit?: number, offset?: number, sort?: ("dr"|"updated") }} [opts]
 */
export async function listSites(opts = {}) {
  const d1 = getD1Database()
  if (d1) {
    const q = normalizeSearchQuery(opts.query)
    const sort = opts.sort === 'updated' ? 'updated' : 'dr'
    const limit = isFiniteNumber(opts.limit) ? Math.max(1, Math.min(100, opts.limit)) : 25
    const offset = clampOffset(opts.offset)
    if (offset > MAX_LIST_OFFSET) return []
    const sql =
      sort === 'updated'
        ? `
            WITH domains AS (
              SELECT domain FROM dr_claims
              UNION
              SELECT domain FROM dr_checks
            ),
            latest_checks AS (
              SELECT domain, domain_rating, checked_at AS updated_at
              FROM (
                SELECT
                  domain,
                  domain_rating,
                  checked_at,
                  id,
                  ROW_NUMBER() OVER (PARTITION BY domain ORDER BY checked_at DESC, id DESC) AS rn
                FROM dr_checks
              )
              WHERE rn = 1
            ),
            site_rows AS (
              SELECT
                d.domain,
                COALESCE(c.domain_rating, cl.domain_rating) AS domain_rating,
                cl.site_title,
                cl.meta_description,
                cl.site_url,
                cl.screenshot_url,
                CASE
                  WHEN c.updated_at IS NULL THEN cl.updated_at
                  WHEN cl.updated_at IS NULL THEN c.updated_at
                  WHEN c.updated_at > cl.updated_at THEN c.updated_at
                  ELSE cl.updated_at
                END AS updated_at
              FROM domains d
              LEFT JOIN latest_checks c ON c.domain = d.domain
              LEFT JOIN dr_claims cl ON cl.domain = d.domain
              WHERE (? IS NULL OR instr(lower(d.domain), ?) > 0)
            )
            SELECT domain, domain_rating, site_title, meta_description, site_url, screenshot_url, updated_at
            FROM site_rows
            ORDER BY updated_at IS NULL ASC, updated_at DESC, domain ASC
            LIMIT ?
          `
        : `
            WITH domains AS (
              SELECT domain FROM dr_claims
              UNION
              SELECT domain FROM dr_checks
            ),
            latest_checks AS (
              SELECT domain, domain_rating, checked_at AS updated_at
              FROM (
                SELECT
                  domain,
                  domain_rating,
                  checked_at,
                  id,
                  ROW_NUMBER() OVER (PARTITION BY domain ORDER BY checked_at DESC, id DESC) AS rn
                FROM dr_checks
              )
              WHERE rn = 1
            ),
            site_rows AS (
              SELECT
                d.domain,
                COALESCE(c.domain_rating, cl.domain_rating) AS domain_rating,
                cl.site_title,
                cl.meta_description,
                cl.site_url,
                cl.screenshot_url,
                CASE
                  WHEN c.updated_at IS NULL THEN cl.updated_at
                  WHEN cl.updated_at IS NULL THEN c.updated_at
                  WHEN c.updated_at > cl.updated_at THEN c.updated_at
                  ELSE cl.updated_at
                END AS updated_at
              FROM domains d
              LEFT JOIN latest_checks c ON c.domain = d.domain
              LEFT JOIN dr_claims cl ON cl.domain = d.domain
              WHERE (? IS NULL OR instr(lower(d.domain), ?) > 0)
            )
            SELECT domain, domain_rating, site_title, meta_description, site_url, screenshot_url, updated_at
            FROM site_rows
            ORDER BY domain_rating IS NULL ASC, domain_rating DESC, updated_at IS NULL ASC, updated_at DESC, domain ASC
            LIMIT ?
          `
    // Listability uses JavaScript rules (domain validation and the spam filter), so it runs on a
    // bounded read: the rows up to the page plus slack, read further only when unlistable rows
    // leave the page short and more rows remain.
    let scan = offset + limit + LISTABLE_SCAN_SLACK
    for (;;) {
      const rawRows = await d1Rows(d1, sql, [q, q, scan])
      const rows = filterListableSiteRows(rawRows)
      const shortfall = offset + limit - rows.length
      if (shortfall <= 0 || rawRows.length < scan) return rows.slice(offset, offset + limit)
      // Grow geometrically, so a search whose matches are mostly unlistable costs a few queries.
      scan = Math.max(scan * 2, scan + shortfall + LISTABLE_SCAN_SLACK)
    }
  }

  if (canUseFallbackStore()) {
    const limit = isFiniteNumber(opts.limit) ? Math.max(1, Math.min(100, opts.limit)) : 25
    const offset = clampOffset(opts.offset)
    if (offset > MAX_LIST_OFFSET) return []
    const q = normalizeSearchQuery(opts.query)
    const sort = opts.sort === 'updated' ? 'updated' : 'dr'

    const domains = new Set([...fallbackChecks.keys(), ...fallbackClaims.keys()])
    const rows = Array.from(domains).map(domain => {
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
        site_title: claim?.site_title ?? null,
        meta_description: claim?.meta_description ?? null,
        site_url: claim?.site_url ?? null,
        screenshot_url: claim?.screenshot_url ?? null,
        updated_at: updatedAt ? updatedAt.toISOString() : null
      }
    })

    const filtered = filterListableSiteRows(rows).filter(row => domainMatches(row.domain, q))
    filtered.sort((a, b) => {
      if (sort === 'updated') {
        const at = a.updated_at ? Date.parse(a.updated_at) : -Infinity
        const bt = b.updated_at ? Date.parse(b.updated_at) : -Infinity
        if (bt !== at) return bt - at
        return a.domain.localeCompare(b.domain)
      }

      const adr = a.domain_rating
      const bdr = b.domain_rating
      const aHas = typeof adr === 'number' && Number.isFinite(adr)
      const bHas = typeof bdr === 'number' && Number.isFinite(bdr)
      if (aHas && bHas && adr !== bdr) return bdr - adr
      if (aHas !== bHas) return aHas ? -1 : 1

      const at = a.updated_at ? Date.parse(a.updated_at) : -Infinity
      const bt = b.updated_at ? Date.parse(b.updated_at) : -Infinity
      if (bt !== at) return bt - at
      return a.domain.localeCompare(b.domain)
    })

    return filtered.slice(offset, offset + limit)
  }

  return persistentDatabaseUnavailable()
}

/**
 * Count all domains that have ever been checked (backed by dr_checks).
 * @param {{ query?: string }} [opts]
 */
export async function countSites(opts = {}) {
  const d1 = getD1Database()
  if (d1) {
    const q = normalizeSearchQuery(opts.query)
    const rows = await d1Rows(
      d1,
      `
        SELECT d.domain, cl.site_title
        FROM (
          SELECT domain FROM dr_claims
          UNION
          SELECT domain FROM dr_checks
        ) d
        LEFT JOIN dr_claims cl ON cl.domain = d.domain
        WHERE (? IS NULL OR instr(lower(d.domain), ?) > 0)
      `,
      [q, q]
    )
    return filterListableSiteRows(rows).length
  }

  if (canUseFallbackStore()) {
    const q = normalizeSearchQuery(opts.query)
    const domains = Array.from(
      new Set([...fallbackChecks.keys(), ...fallbackClaims.keys()])
    ).filter(domain =>
      isListableSiteRow({ domain, site_title: fallbackClaims.get(domain)?.site_title })
    )
    if (!q) return domains.length
    let count = 0
    for (const domain of domains) {
      if (domainMatches(domain, q)) count += 1
    }
    return count
  }

  return persistentDatabaseUnavailable()
}

// A sitemap file holds at most 50,000 URLs (xml-sitemaps.md, When a Group Overflows).
export const SITEMAP_URL_LIMIT = 50000

/**
 * Every listable site (valid, non-spam domain) with the time it last changed, for the sitemap.
 * @returns {Promise<Array<{ domain: string, updated_at: (string|null) }>>}
 */
export async function listSitemapSites() {
  const d1 = getD1Database()
  if (d1) {
    const rows = await d1Rows(
      d1,
      `
        WITH domains AS (
          SELECT domain FROM dr_claims
          UNION
          SELECT domain FROM dr_checks
        ),
        last_checks AS (
          SELECT domain, MAX(checked_at) AS checked_at FROM dr_checks GROUP BY domain
        )
        SELECT
          d.domain,
          cl.site_title,
          CASE
            WHEN lc.checked_at IS NULL THEN cl.updated_at
            WHEN cl.updated_at IS NULL THEN lc.checked_at
            WHEN lc.checked_at > cl.updated_at THEN lc.checked_at
            ELSE cl.updated_at
          END AS updated_at
        FROM domains d
        LEFT JOIN last_checks lc ON lc.domain = d.domain
        LEFT JOIN dr_claims cl ON cl.domain = d.domain
        ORDER BY d.domain
        LIMIT ?
      `,
      [SITEMAP_URL_LIMIT + 1]
    )
    return filterListableSiteRows(rows).map(row => ({
      domain: row.domain,
      updated_at: isoText(row.updated_at)
    }))
  }

  if (canUseFallbackStore()) {
    const domains = Array.from(new Set([...fallbackChecks.keys(), ...fallbackClaims.keys()])).sort()
    return domains
      .filter(domain =>
        isListableSiteRow({ domain, site_title: fallbackClaims.get(domain)?.site_title })
      )
      .map(domain => {
        const times = [
          fallbackClaims.get(domain)?.updated_at,
          ...(fallbackChecks.get(domain) ?? []).map(check => check.checked_at)
        ]
          .map(value => coerceDate(value))
          .filter(date => date !== null)
          .map(date => date.getTime())
        return {
          domain,
          updated_at: times.length ? new Date(Math.max(...times)).toISOString() : null
        }
      })
  }

  return persistentDatabaseUnavailable()
}

/**
 * Delete invalid domains and unclaimed spam sites, or only the given invalid domains.
 * @param {{ domains?: string[], dryRun?: boolean }} [opts]
 */
export async function purgeInvalidSiteDomains(opts = {}) {
  const requested = Array.isArray(opts.domains)
    ? opts.domains.filter(domain => String(domain ?? '').trim())
    : null
  const dryRun = opts.dryRun !== false

  const d1 = getD1Database()
  if (d1) {
    const invalidDomains = requested
      ? Array.from(
          new Set(
            requested
              .map(domain =>
                String(domain ?? '')
                  .trim()
                  .toLowerCase()
              )
              .filter(domain => domain && !isValidDomainTarget(domain))
          )
        )
      : Array.from(
          new Set(
            (
              await d1Rows(
                d1,
                `
                SELECT d.domain, cl.site_title, cl.email
                FROM (
                  SELECT domain FROM dr_claims
                  UNION
                  SELECT domain FROM dr_checks
                ) d
                LEFT JOIN dr_claims cl ON cl.domain = d.domain
              `
              )
            )
              .filter(isPurgeableSiteRow)
              .map(row => String(row.domain).trim().toLowerCase())
          )
        )

    if (!invalidDomains.length) {
      return {
        claimCount: 0,
        checkCount: 0,
        domains: [],
        dryRun
      }
    }

    let claimCount = 0
    let checkCount = 0
    for (const domain of invalidDomains) {
      const claimRow = await d1First(
        d1,
        `
          SELECT COUNT(*) AS count
          FROM dr_claims
          WHERE domain = ?
        `,
        [domain]
      )
      const checkRow = await d1First(
        d1,
        `
          SELECT COUNT(*) AS count
          FROM dr_checks
          WHERE domain = ?
        `,
        [domain]
      )
      claimCount += Number(claimRow?.count) || 0
      checkCount += Number(checkRow?.count) || 0
    }

    if (dryRun) return { claimCount, checkCount, domains: invalidDomains, dryRun }

    for (const domain of invalidDomains) {
      await d1Batch(d1, [
        d1Statement(
          d1,
          `
            DELETE FROM dr_checks
            WHERE domain = ?
          `,
          [domain]
        ),
        d1Statement(
          d1,
          `
            DELETE FROM dr_claims
            WHERE domain = ?
          `,
          [domain]
        )
      ])
    }

    return { claimCount, checkCount, domains: invalidDomains, dryRun }
  }

  const invalidDomains = requested
    ? Array.from(
        new Set(
          requested
            .map(domain =>
              String(domain ?? '')
                .trim()
                .toLowerCase()
            )
            .filter(domain => domain && !isValidDomainTarget(domain))
        )
      )
    : canUseFallbackStore()
      ? Array.from(
          new Set(
            [...fallbackClaims.keys(), ...fallbackChecks.keys()]
              .map(domain => ({ domain, ...fallbackClaims.get(domain) }))
              .filter(isPurgeableSiteRow)
              .map(row => String(row.domain).trim().toLowerCase())
          )
        )
      : persistentDatabaseUnavailable()

  if (!invalidDomains.length) {
    return {
      claimCount: 0,
      checkCount: 0,
      domains: [],
      dryRun
    }
  }

  if (dryRun) {
    if (!canUseFallbackStore()) persistentDatabaseUnavailable()
    return {
      claimCount: invalidDomains.filter(domain => fallbackClaims.has(domain)).length,
      checkCount: invalidDomains.filter(domain => fallbackChecks.has(domain)).length,
      domains: invalidDomains,
      dryRun
    }
  }

  if (canUseFallbackStore()) {
    let claimCount = 0
    let checkCount = 0
    for (const domain of invalidDomains) {
      if (fallbackClaims.delete(domain)) claimCount += 1
      if (fallbackChecks.delete(domain)) checkCount += 1
    }
    schedulePersist()
    return { claimCount, checkCount, domains: invalidDomains, dryRun }
  }

  return persistentDatabaseUnavailable()
}

function normalizeEmail(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
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
  cancelAtPeriodEnd = null
}) {
  const normalizedEmail = normalizeEmail(email)
  const subscriptionId = String(stripeSubscriptionId ?? '').trim()
  if (!normalizedEmail || !subscriptionId) return null

  const d1 = getD1Database()
  if (d1) {
    const now = nowIsoText()
    return normalizeD1SubscriptionRow(
      await d1First(
        d1,
        `
          INSERT INTO dr_subscriptions (
            email,
            stripe_customer_id,
            stripe_subscription_id,
            stripe_price_id,
            billing_interval,
            domains_limit,
            status,
            current_period_end,
            cancel_at_period_end,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (stripe_subscription_id)
          DO UPDATE SET
            email = COALESCE(excluded.email, dr_subscriptions.email),
            stripe_customer_id = COALESCE(excluded.stripe_customer_id, dr_subscriptions.stripe_customer_id),
            stripe_price_id = COALESCE(excluded.stripe_price_id, dr_subscriptions.stripe_price_id),
            billing_interval = COALESCE(excluded.billing_interval, dr_subscriptions.billing_interval),
            domains_limit = COALESCE(excluded.domains_limit, dr_subscriptions.domains_limit),
            status = COALESCE(excluded.status, dr_subscriptions.status),
            current_period_end = COALESCE(excluded.current_period_end, dr_subscriptions.current_period_end),
            cancel_at_period_end = COALESCE(excluded.cancel_at_period_end, dr_subscriptions.cancel_at_period_end),
            updated_at = excluded.updated_at
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
        `,
        [
          normalizedEmail,
          stripeCustomerId,
          subscriptionId,
          stripePriceId,
          billingInterval,
          domainsLimit,
          status,
          isoText(currentPeriodEnd),
          toD1Boolean(cancelAtPeriodEnd),
          now
        ]
      )
    )
  }

  if (canUseFallbackStore()) {
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
      cancel_at_period_end: cancelAtPeriodEnd ?? previous?.cancel_at_period_end ?? null,
      created_at: previous?.created_at ?? now,
      updated_at: now
    }
    fallbackSubscriptions.set(subscriptionId, next)
    schedulePersist()
    return next
  }

  return persistentDatabaseUnavailable()
}

/**
 * Fetch the most recent active subscription for an email.
 * @param {string} email
 */
export async function getActiveSubscriptionByEmail(email) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) return null

  const d1 = getD1Database()
  if (d1) {
    return normalizeD1SubscriptionRow(
      await d1First(
        d1,
        `
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
          WHERE email = ?
            AND status IN ('active', 'trialing')
            AND (current_period_end IS NULL OR current_period_end > ?)
          ORDER BY updated_at DESC
          LIMIT 1
        `,
        [normalizedEmail, nowIsoText()]
      )
    )
  }

  if (canUseFallbackStore()) {
    const matches = Array.from(fallbackSubscriptions.values()).filter(
      row => row.email === normalizedEmail && ['active', 'trialing'].includes(row.status)
    )
    if (!matches.length) return null
    matches.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    return matches[0] || null
  }

  return persistentDatabaseUnavailable()
}

/**
 * Fetch the most recent subscription for an email (any status).
 * @param {string} email
 */
export async function getLatestSubscriptionByEmail(email) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) return null

  const d1 = getD1Database()
  if (d1) {
    return normalizeD1SubscriptionRow(
      await d1First(
        d1,
        `
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
          WHERE email = ?
          ORDER BY updated_at DESC
          LIMIT 1
        `,
        [normalizedEmail]
      )
    )
  }

  if (canUseFallbackStore()) {
    const matches = Array.from(fallbackSubscriptions.values()).filter(
      row => row.email === normalizedEmail
    )
    if (!matches.length) return null
    matches.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    return matches[0] || null
  }

  return persistentDatabaseUnavailable()
}

/**
 * List subscriptions for reporting.
 * @param {{ email?: string, limit?: number, offset?: number }} [opts]
 */
export async function listSubscriptions(opts = {}) {
  const email = opts?.email ? normalizeEmail(opts.email) : null
  const limit = isFiniteNumber(opts.limit) ? Math.max(1, Math.min(200, opts.limit)) : 100
  const offset = isFiniteNumber(opts.offset) ? Math.max(0, opts.offset) : 0

  const d1 = getD1Database()
  if (d1) {
    const rows = await d1Rows(
      d1,
      `
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
        WHERE (? IS NULL OR email = ?)
        ORDER BY updated_at DESC
        LIMIT ?
        OFFSET ?
      `,
      [email, email, limit, offset]
    )
    return rows.map(normalizeD1SubscriptionRow)
  }

  if (canUseFallbackStore()) {
    let rows = Array.from(fallbackSubscriptions.values())
    if (email) rows = rows.filter(row => row.email === email)
    rows.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    return rows.slice(offset, offset + limit)
  }

  return persistentDatabaseUnavailable()
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
  error = null
}) {
  if (!stripeEventType) return null

  const d1 = getD1Database()
  if (d1) {
    return normalizeD1BillingAuditRow(
      await d1First(
        d1,
        `
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
            error,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (stripe_event_id) WHERE stripe_event_id IS NOT NULL
          DO UPDATE SET
            stripe_event_type = excluded.stripe_event_type,
            stripe_customer_id = COALESCE(excluded.stripe_customer_id, dr_billing_audit.stripe_customer_id),
            stripe_subscription_id = COALESCE(excluded.stripe_subscription_id, dr_billing_audit.stripe_subscription_id),
            stripe_price_id = COALESCE(excluded.stripe_price_id, dr_billing_audit.stripe_price_id),
            email = COALESCE(excluded.email, dr_billing_audit.email),
            billing_interval = COALESCE(excluded.billing_interval, dr_billing_audit.billing_interval),
            domains_limit = COALESCE(excluded.domains_limit, dr_billing_audit.domains_limit),
            status = COALESCE(excluded.status, dr_billing_audit.status),
            current_period_end = COALESCE(excluded.current_period_end, dr_billing_audit.current_period_end),
            cancel_at_period_end = COALESCE(excluded.cancel_at_period_end, dr_billing_audit.cancel_at_period_end),
            event_created_at = COALESCE(excluded.event_created_at, dr_billing_audit.event_created_at),
            success = COALESCE(excluded.success, dr_billing_audit.success),
            error = excluded.error,
            created_at = excluded.created_at
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
        `,
        [
          stripeEventId,
          stripeEventType,
          stripeCustomerId,
          stripeSubscriptionId,
          stripePriceId,
          email ? normalizeEmail(email) : null,
          billingInterval,
          domainsLimit,
          status,
          isoText(currentPeriodEnd),
          toD1Boolean(cancelAtPeriodEnd),
          isoText(eventCreatedAt),
          typeof success === 'boolean' ? toD1Boolean(success) : 1,
          error,
          nowIsoText()
        ]
      )
    )
  }

  if (canUseFallbackStore()) {
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
      cancel_at_period_end: typeof cancelAtPeriodEnd === 'boolean' ? cancelAtPeriodEnd : null,
      event_created_at: eventCreatedAt ?? null,
      success: typeof success === 'boolean' ? success : true,
      error: error ?? null,
      created_at: createdAt
    }
    fallbackBillingAudit.push(entry)
    if (fallbackBillingAudit.length > 500)
      fallbackBillingAudit.splice(0, fallbackBillingAudit.length - 500)
    schedulePersist()
    return entry
  }

  return persistentDatabaseUnavailable()
}

/**
 * Fetch the most recent billing audit event.
 * @param {{ success?: (boolean|null) }} [opts]
 */
export async function getLatestBillingAuditEvent(opts = {}) {
  const success = typeof opts?.success === 'boolean' ? opts.success : null

  const d1 = getD1Database()
  if (d1) {
    return normalizeD1BillingAuditRow(
      await d1First(
        d1,
        `
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
          WHERE (? IS NULL OR success = ?)
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [
          success === null ? null : toD1Boolean(success),
          success === null ? null : toD1Boolean(success)
        ]
      )
    )
  }

  if (canUseFallbackStore()) {
    const rows =
      success === null
        ? [...fallbackBillingAudit]
        : fallbackBillingAudit.filter(row => row.success === success)
    if (!rows.length) return null
    rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return rows[0] || null
  }

  return persistentDatabaseUnavailable()
}

export async function getLatestBillingAuditFailure() {
  return getLatestBillingAuditEvent({ success: false })
}

/**
 * List billing audit rows for migration/export tooling.
 * @param {{ success?: (boolean|null), limit?: number, offset?: number }} [opts]
 */
export async function listBillingAudit(opts = {}) {
  const success = typeof opts?.success === 'boolean' ? opts.success : null
  const limit = isFiniteNumber(opts.limit) ? Math.max(1, Math.min(1000, opts.limit)) : 500
  const offset = isFiniteNumber(opts.offset) ? Math.max(0, opts.offset) : 0

  const d1 = getD1Database()
  if (d1) {
    const rows = await d1Rows(
      d1,
      `
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
        WHERE (? IS NULL OR success = ?)
        ORDER BY created_at ASC, id ASC
        LIMIT ?
        OFFSET ?
      `,
      [
        success === null ? null : toD1Boolean(success),
        success === null ? null : toD1Boolean(success),
        limit,
        offset
      ]
    )
    return rows.map(normalizeD1BillingAuditRow)
  }

  if (canUseFallbackStore()) {
    const rows = (
      success === null
        ? [...fallbackBillingAudit]
        : fallbackBillingAudit.filter(row => row.success === success)
    )
      .slice()
      .sort((a, b) => {
        const dateCompare = String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
        if (dateCompare) return dateCompare
        return String(a.stripe_event_id ?? '').localeCompare(String(b.stripe_event_id ?? ''))
      })
      .slice(offset, offset + limit)
    return rows
  }

  return persistentDatabaseUnavailable()
}

/**
 * Remove billing audit entries older than the provided number of days.
 * @param {{ olderThanDays?: number }} [opts]
 */
function billingAuditCutoff(opts = {}) {
  const days = isFiniteNumber(opts?.olderThanDays)
    ? Math.max(1, Math.floor(opts.olderThanDays))
    : 180
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return { days, cutoff }
}

/**
 * Count billing audit entries older than the provided number of days without deleting them.
 * @param {{ olderThanDays?: number }} [opts]
 */
export async function countPrunableBillingAudit(opts = {}) {
  const { cutoff } = billingAuditCutoff(opts)

  const d1 = getD1Database()
  if (d1) {
    const row = await d1First(
      d1,
      `
        SELECT COUNT(*) AS count
        FROM dr_billing_audit
        WHERE created_at < ?
      `,
      [cutoff.toISOString()]
    )
    return { count: Number(row?.count) || 0, cutoff }
  }

  if (canUseFallbackStore()) {
    const count = fallbackBillingAudit.filter(row => {
      const createdAt = row.created_at instanceof Date ? row.created_at : new Date(row.created_at)
      return Number.isFinite(createdAt.getTime()) && createdAt < cutoff
    }).length
    return { count, cutoff }
  }

  return persistentDatabaseUnavailable()
}

export async function pruneBillingAudit(opts = {}) {
  const { cutoff } = billingAuditCutoff(opts)

  const d1 = getD1Database()
  if (d1) {
    const result = await d1Run(
      d1,
      `
        DELETE FROM dr_billing_audit
        WHERE created_at < ?
      `,
      [cutoff.toISOString()]
    )
    const removed = Number(
      result?.meta?.changes ?? result?.changes ?? result?.rowCount ?? result?.count ?? 0
    )
    return { removed, cutoff }
  }

  if (canUseFallbackStore()) {
    const before = fallbackBillingAudit.length
    const remaining = fallbackBillingAudit.filter(row => {
      const createdAt = row.created_at instanceof Date ? row.created_at : new Date(row.created_at)
      return Number.isFinite(createdAt.getTime()) && createdAt >= cutoff
    })
    fallbackBillingAudit.splice(0, fallbackBillingAudit.length, ...remaining)
    if (before !== fallbackBillingAudit.length) schedulePersist()
    return { removed: before - fallbackBillingAudit.length, cutoff }
  }

  return persistentDatabaseUnavailable()
}
