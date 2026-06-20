import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const DB_ENV_KEYS = [
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "STORAGE_URL",
  "STORAGE_URL_NON_POOLING",
]

const cloudflareMocks = vi.hoisted(() => {
  const state = { db: null }
  return {
    state,
    getCloudflareContext: vi.fn(() => ({ env: { SERP_DR_DB: state.db } })),
  }
})

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: cloudflareMocks.getCloudflareContext,
}))

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

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim()
}

function copyRow(row) {
  return row ? { ...row } : null
}

function likeDomain(domain, pattern) {
  if (pattern === null || pattern === undefined) return true
  const needle = String(pattern).replaceAll("%", "").toLowerCase()
  return String(domain).toLowerCase().includes(needle)
}

function coalesce(next, previous) {
  return next ?? previous ?? null
}

function compareIsoDesc(a, b) {
  if (a === b) return 0
  if (!a) return 1
  if (!b) return -1
  return a > b ? -1 : 1
}

function compareDrDesc(a, b) {
  const adr = a.domain_rating
  const bdr = b.domain_rating
  const aHas = typeof adr === "number" && Number.isFinite(adr)
  const bHas = typeof bdr === "number" && Number.isFinite(bdr)
  if (aHas && bHas && adr !== bdr) return bdr - adr
  if (aHas !== bHas) return aHas ? -1 : 1
  return 0
}

function createMockD1() {
  const state = {
    claims: new Map(),
    checks: [],
    subscriptions: new Map(),
    billingAudit: [],
    nextCheckId: 1,
    nextBillingId: 1,
  }
  const calls = []

  function claimDefaults(domain, now) {
    return {
      domain,
      email: null,
      domain_rating: null,
      provider: null,
      site_title: null,
      meta_description: null,
      site_url: null,
      screenshot_url: null,
      claimed_at: now,
      updated_at: now,
    }
  }

  function allSiteRows(pattern, sort) {
    const domains = new Set([
      ...Array.from(state.claims.keys()),
      ...state.checks.map((row) => row.domain),
    ])

    const rows = Array.from(domains)
      .filter((domain) => likeDomain(domain, pattern))
      .map((domain) => {
        const claim = state.claims.get(domain) || null
        const latestCheck =
          state.checks
            .filter((row) => row.domain === domain)
            .sort((a, b) => {
              const dateDiff = compareIsoDesc(a.checked_at, b.checked_at)
              if (dateDiff) return dateDiff
              return b.id - a.id
            })[0] || null
        const updatedAt =
          latestCheck?.checked_at && claim?.updated_at
            ? latestCheck.checked_at > claim.updated_at
              ? latestCheck.checked_at
              : claim.updated_at
            : latestCheck?.checked_at ?? claim?.updated_at ?? null

        return {
          domain,
          domain_rating: latestCheck?.domain_rating ?? claim?.domain_rating ?? null,
          site_title: claim?.site_title ?? null,
          meta_description: claim?.meta_description ?? null,
          site_url: claim?.site_url ?? null,
          screenshot_url: claim?.screenshot_url ?? null,
          updated_at: updatedAt,
        }
      })

    rows.sort((a, b) => {
      if (sort === "updated") {
        const dateDiff = compareIsoDesc(a.updated_at, b.updated_at)
        if (dateDiff) return dateDiff
        return a.domain.localeCompare(b.domain)
      }

      const drDiff = compareDrDesc(a, b)
      if (drDiff) return drDiff
      const dateDiff = compareIsoDesc(a.updated_at, b.updated_at)
      if (dateDiff) return dateDiff
      return a.domain.localeCompare(b.domain)
    })

    return rows
  }

  function execute(sql, params) {
    const text = normalizeSql(sql)

    if (text.startsWith("SELECT domain, email, domain_rating, provider")) {
      const [domain] = params
      return { rows: [copyRow(state.claims.get(domain))].filter(Boolean), changes: 0 }
    }

    if (text.startsWith("INSERT INTO dr_claims (domain, email, domain_rating, provider")) {
      const [domain, email, domainRating, provider, updatedAt] = params
      const previous = state.claims.get(domain)
      const next = {
        ...(previous || claimDefaults(domain, updatedAt)),
        email: email ?? previous?.email ?? null,
        domain_rating: domainRating,
        provider,
        updated_at: updatedAt,
      }
      state.claims.set(domain, next)
      return { rows: [copyRow(next)], changes: 1 }
    }

    if (text.startsWith("INSERT INTO dr_claims (domain, email, updated_at")) {
      const [domain, email, updatedAt] = params
      const previous = state.claims.get(domain)
      const next = {
        ...(previous || claimDefaults(domain, updatedAt)),
        email,
        updated_at: updatedAt,
      }
      state.claims.set(domain, next)
      return { rows: [copyRow(next)], changes: 1 }
    }

    if (text.startsWith("INSERT INTO dr_claims (domain, updated_at")) {
      const [domain, updatedAt] = params
      const previous = state.claims.get(domain)
      const next = {
        ...(previous || claimDefaults(domain, updatedAt)),
        updated_at: updatedAt,
      }
      state.claims.set(domain, next)
      return { rows: [copyRow(next)], changes: 1 }
    }

    if (text.startsWith("INSERT INTO dr_claims (domain, site_title")) {
      const [domain, siteTitle, metaDescription, siteUrl, screenshotUrl, updatedAt] = params
      const previous = state.claims.get(domain)
      const next = {
        ...(previous || claimDefaults(domain, updatedAt)),
        site_title: siteTitle ?? previous?.site_title ?? null,
        meta_description: metaDescription ?? previous?.meta_description ?? null,
        site_url: siteUrl ?? previous?.site_url ?? null,
        screenshot_url: screenshotUrl ?? previous?.screenshot_url ?? null,
        updated_at: updatedAt,
      }
      state.claims.set(domain, next)
      return { rows: [copyRow(next)], changes: 1 }
    }

    if (text.startsWith("UPDATE dr_claims SET email = NULL")) {
      const [updatedAt, domain, email] = params
      const previous = state.claims.get(domain)
      if (!previous || String(previous.email ?? "").toLowerCase() !== email) {
        return { rows: [], changes: 0 }
      }
      const next = { ...previous, email: null, updated_at: updatedAt }
      state.claims.set(domain, next)
      return { rows: [copyRow(next)], changes: 1 }
    }

    if (text.startsWith("SELECT COUNT(*) AS count FROM dr_claims WHERE email = ?")) {
      const [email, pattern] = params
      const count = Array.from(state.claims.values()).filter(
        (row) => row.email === email && likeDomain(row.domain, pattern)
      ).length
      return { rows: [{ count }], changes: 0 }
    }

    if (text.startsWith("SELECT COUNT(*) AS count FROM dr_claims WHERE domain = ?")) {
      const [domain] = params
      return { rows: [{ count: state.claims.has(domain) ? 1 : 0 }], changes: 0 }
    }

    if (text.startsWith("SELECT COUNT(*) AS count FROM dr_claims")) {
      const [pattern] = params
      const count = Array.from(state.claims.values()).filter((row) => likeDomain(row.domain, pattern)).length
      return { rows: [{ count }], changes: 0 }
    }

    if (text.startsWith("SELECT domain, domain_rating, updated_at")) {
      const hasEmail = text.includes("WHERE email = ?")
      const email = hasEmail ? params[0] : null
      const pattern = hasEmail ? params[1] : params[0]
      const limit = hasEmail ? params[3] : params[2]
      const offset = hasEmail ? params[4] : params[3]
      const sort = text.includes("ORDER BY updated_at") ? "updated" : "dr"
      const rows = Array.from(state.claims.values())
        .filter((row) => (!hasEmail || row.email === email) && likeDomain(row.domain, pattern))
        .map((row) => ({
          domain: row.domain,
          domain_rating: row.domain_rating,
          updated_at: row.updated_at,
          site_title: row.site_title,
          meta_description: row.meta_description,
          site_url: row.site_url,
          screenshot_url: row.screenshot_url,
        }))
        .sort((a, b) => {
          if (sort === "updated") {
            const dateDiff = compareIsoDesc(a.updated_at, b.updated_at)
            if (dateDiff) return dateDiff
            return a.domain.localeCompare(b.domain)
          }
          const drDiff = compareDrDesc(a, b)
          if (drDiff) return drDiff
          const dateDiff = compareIsoDesc(a.updated_at, b.updated_at)
          if (dateDiff) return dateDiff
          return a.domain.localeCompare(b.domain)
        })
      return { rows: rows.slice(offset, offset + limit), changes: 0 }
    }

    if (text.startsWith("INSERT INTO dr_checks")) {
      const [domain, domainRating, provider, checkedAt] = params
      const row = {
        id: state.nextCheckId++,
        domain,
        domain_rating: domainRating,
        provider,
        checked_at: checkedAt,
      }
      state.checks.push(row)
      return { rows: [copyRow(row)], changes: 1 }
    }

    if (text.startsWith("DELETE FROM dr_checks")) {
      const before = state.checks.length
      if (params.length === 4) {
        const [domain, nullProvider, provider, checkedAt] = params
        state.checks = state.checks.filter(
          (row) =>
            !(
              row.domain === domain &&
              row.checked_at === checkedAt &&
              ((row.provider === null && nullProvider === null) || row.provider === provider)
            )
        )
      } else {
        const [domain] = params
        state.checks = state.checks.filter((row) => row.domain !== domain)
      }
      return { rows: [], changes: before - state.checks.length }
    }

    if (text.startsWith("SELECT domain_rating, provider, checked_at FROM dr_checks")) {
      const [domain, limit] = params
      const rows = state.checks
        .filter((row) => row.domain === domain)
        .sort((a, b) => compareIsoDesc(a.checked_at, b.checked_at))
        .slice(0, limit)
        .map((row) => ({
          domain_rating: row.domain_rating,
          provider: row.provider,
          checked_at: row.checked_at,
        }))
      return { rows, changes: 0 }
    }

    if (text.startsWith("SELECT COUNT(*) AS count FROM dr_checks WHERE domain = ?")) {
      const [domain] = params
      return { rows: [{ count: state.checks.filter((row) => row.domain === domain).length }], changes: 0 }
    }

    if (text.startsWith("WITH domains AS")) {
      const [pattern] = params
      const sort = text.includes("ORDER BY updated_at") ? "updated" : "dr"
      return { rows: allSiteRows(pattern, sort), changes: 0 }
    }

    if (text.startsWith("SELECT domain FROM ( SELECT domain FROM dr_claims UNION SELECT domain FROM dr_checks")) {
      const [pattern] = params
      const domains = new Set([
        ...Array.from(state.claims.keys()),
        ...state.checks.map((row) => row.domain),
      ])
      const rows = Array.from(domains)
        .filter((domain) => likeDomain(domain, pattern))
        .map((domain) => ({ domain }))
      return { rows, changes: 0 }
    }

    if (text === "SELECT domain FROM dr_claims UNION SELECT domain FROM dr_checks") {
      const domains = new Set([
        ...Array.from(state.claims.keys()),
        ...state.checks.map((row) => row.domain),
      ])
      return { rows: Array.from(domains).map((domain) => ({ domain })), changes: 0 }
    }

    if (text.startsWith("DELETE FROM dr_claims")) {
      const [domain] = params
      const existed = state.claims.delete(domain)
      return { rows: [], changes: existed ? 1 : 0 }
    }

    if (text.startsWith("INSERT INTO dr_subscriptions")) {
      const [
        email,
        stripeCustomerId,
        subscriptionId,
        stripePriceId,
        billingInterval,
        domainsLimit,
        status,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        updatedAt,
      ] = params
      const previous = state.subscriptions.get(subscriptionId)
      const next = {
        email: coalesce(email, previous?.email),
        stripe_customer_id: coalesce(stripeCustomerId, previous?.stripe_customer_id),
        stripe_subscription_id: subscriptionId,
        stripe_price_id: coalesce(stripePriceId, previous?.stripe_price_id),
        billing_interval: coalesce(billingInterval, previous?.billing_interval),
        domains_limit: coalesce(domainsLimit, previous?.domains_limit),
        status: coalesce(status, previous?.status),
        current_period_end: coalesce(currentPeriodEnd, previous?.current_period_end),
        cancel_at_period_end: coalesce(cancelAtPeriodEnd, previous?.cancel_at_period_end),
        created_at: previous?.created_at ?? updatedAt,
        updated_at: updatedAt,
      }
      state.subscriptions.set(subscriptionId, next)
      return { rows: [copyRow(next)], changes: 1 }
    }

    if (text.includes("FROM dr_subscriptions") && text.includes("status IN ('active', 'trialing')")) {
      const [email, now] = params
      const rows = Array.from(state.subscriptions.values())
        .filter(
          (row) =>
            row.email === email &&
            ["active", "trialing"].includes(row.status) &&
            (row.current_period_end === null || row.current_period_end > now)
        )
        .sort((a, b) => compareIsoDesc(a.updated_at, b.updated_at))
      return { rows: rows.slice(0, 1).map(copyRow), changes: 0 }
    }

    if (text.includes("FROM dr_subscriptions") && text.includes("WHERE email = ?")) {
      const [email] = params
      const rows = Array.from(state.subscriptions.values())
        .filter((row) => row.email === email)
        .sort((a, b) => compareIsoDesc(a.updated_at, b.updated_at))
      return { rows: rows.slice(0, 1).map(copyRow), changes: 0 }
    }

    if (text.includes("FROM dr_subscriptions") && text.includes("WHERE (? IS NULL OR email = ?)")) {
      const [email, , limit, offset] = params
      const rows = Array.from(state.subscriptions.values())
        .filter((row) => email === null || row.email === email)
        .sort((a, b) => compareIsoDesc(a.updated_at, b.updated_at))
      return { rows: rows.slice(offset, offset + limit).map(copyRow), changes: 0 }
    }

    if (text.startsWith("INSERT INTO dr_billing_audit")) {
      const [
        stripeEventId,
        stripeEventType,
        stripeCustomerId,
        stripeSubscriptionId,
        stripePriceId,
        email,
        billingInterval,
        domainsLimit,
        status,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        eventCreatedAt,
        success,
        error,
        createdAt,
      ] = params
      const existing =
        stripeEventId === null
          ? null
          : state.billingAudit.find((row) => row.stripe_event_id === stripeEventId)
      const next = {
        id: existing?.id ?? state.nextBillingId++,
        stripe_event_id: stripeEventId,
        stripe_event_type: stripeEventType,
        stripe_customer_id: coalesce(stripeCustomerId, existing?.stripe_customer_id),
        stripe_subscription_id: coalesce(stripeSubscriptionId, existing?.stripe_subscription_id),
        stripe_price_id: coalesce(stripePriceId, existing?.stripe_price_id),
        email: coalesce(email, existing?.email),
        billing_interval: coalesce(billingInterval, existing?.billing_interval),
        domains_limit: coalesce(domainsLimit, existing?.domains_limit),
        status: coalesce(status, existing?.status),
        current_period_end: coalesce(currentPeriodEnd, existing?.current_period_end),
        cancel_at_period_end: coalesce(cancelAtPeriodEnd, existing?.cancel_at_period_end),
        event_created_at: coalesce(eventCreatedAt, existing?.event_created_at),
        success: coalesce(success, existing?.success),
        error: coalesce(error, existing?.error),
        created_at: createdAt,
      }
      if (existing) {
        Object.assign(existing, next)
      } else {
        state.billingAudit.push(next)
      }
      return { rows: [copyRow(next)], changes: 1 }
    }

    if (text.includes("FROM dr_billing_audit") && text.includes("ORDER BY created_at DESC LIMIT 1")) {
      const [success] = params
      const rows = state.billingAudit
        .filter((row) => success === null || row.success === success)
        .sort((a, b) => compareIsoDesc(a.created_at, b.created_at))
      return { rows: rows.slice(0, 1).map(copyRow), changes: 0 }
    }

    if (text.startsWith("SELECT COUNT(*) AS count FROM dr_billing_audit")) {
      const [cutoff] = params
      return {
        rows: [{ count: state.billingAudit.filter((row) => row.created_at < cutoff).length }],
        changes: 0,
      }
    }

    if (text.startsWith("DELETE FROM dr_billing_audit")) {
      const [cutoff] = params
      const before = state.billingAudit.length
      state.billingAudit = state.billingAudit.filter((row) => row.created_at >= cutoff)
      return { rows: [], changes: before - state.billingAudit.length }
    }

    throw new Error(`Unhandled D1 SQL in test mock: ${text}`)
  }

  function statement(sql, params = []) {
    return {
      bind: (...nextParams) => statement(sql, nextParams),
      async run() {
        calls.push({ method: "run", sql: normalizeSql(sql), params })
        const result = execute(sql, params)
        return { success: true, results: result.rows, meta: { changes: result.changes } }
      },
      async first() {
        calls.push({ method: "first", sql: normalizeSql(sql), params })
        const result = execute(sql, params)
        return result.rows[0] ?? null
      },
    }
  }

  return {
    state,
    calls,
    prepare(sql) {
      calls.push({ method: "prepare", sql: normalizeSql(sql) })
      return statement(sql)
    },
    async batch(statements) {
      calls.push({ method: "batch", count: statements.length })
      const results = []
      for (const item of statements) {
        results.push(await item.run())
      }
      return results
    },
  }
}

async function importDbWithD1() {
  vi.resetModules()
  clearDbEnv()
  const d1 = createMockD1()
  cloudflareMocks.state.db = d1
  const db = await import("./db.mjs")
  return { db, d1 }
}

describe("D1 database boundary", () => {
  beforeEach(() => {
    clearDbEnv()
    cloudflareMocks.getCloudflareContext.mockClear()
    cloudflareMocks.state.db = null
  })

  afterEach(() => {
    cloudflareMocks.state.db = null
    restoreEnv()
    vi.resetModules()
  })

  it("upserts and reads claims through the SERP_DR_DB binding", async () => {
    const { db, d1 } = await importDbWithD1()

    const first = await db.upsertClaim({
      domain: "example.com",
      email: "owner@example.com",
      domainRating: 42.9,
      provider: "ahrefs",
    })
    const second = await db.upsertClaim({
      domain: "example.com",
      email: null,
      domainRating: 51,
      provider: "moz",
    })
    const claim = await db.getClaim("example.com")

    expect(first).toMatchObject({ domain: "example.com", email: "owner@example.com", domain_rating: 42 })
    expect(second).toMatchObject({ domain: "example.com", email: "owner@example.com", domain_rating: 51 })
    expect(claim).toMatchObject({ domain: "example.com", email: "owner@example.com", provider: "moz" })
    expect(d1.calls.some((call) => call.method === "first")).toBe(true)
  })

  it("filters invalid site domains before pagination and count", async () => {
    const { db } = await importDbWithD1()

    await db.recordDrCheck({
      domain: "phpinfo.php",
      domainRating: 99,
      checkedAt: new Date("2026-01-03T00:00:00Z"),
    })
    await db.recordDrCheck({
      domain: "valid-a.com",
      domainRating: 80,
      checkedAt: new Date("2026-01-02T00:00:00Z"),
    })
    await db.recordDrCheck({
      domain: "valid-b.com",
      domainRating: 70,
      checkedAt: new Date("2026-01-01T00:00:00Z"),
    })

    const firstPage = await db.listSites({ limit: 1, offset: 0, sort: "dr" })
    const count = await db.countSites()

    expect(firstPage).toEqual([
      expect.objectContaining({ domain: "valid-a.com", domain_rating: 80 }),
    ])
    expect(count).toBe(2)
  })

  it("replaces duplicate historical checks for null and non-null providers", async () => {
    const { db, d1 } = await importDbWithD1()
    const domain = "history.example.com"

    await db.recordDrHistoryChecks({
      domain,
      provider: null,
      points: [{ checkedAt: "2026-01-01", domainRating: 10 }],
    })
    await db.recordDrHistoryChecks({
      domain,
      provider: null,
      points: [{ checkedAt: "2026-01-01", domainRating: 12 }],
    })
    await db.recordDrHistoryChecks({
      domain,
      provider: "ahrefs-history",
      points: [{ checkedAt: "2026-01-01", domainRating: 30 }],
    })
    await db.recordDrHistoryChecks({
      domain,
      provider: "ahrefs-history",
      points: [{ checkedAt: "2026-01-01", domainRating: 32 }],
    })

    const checks = await db.getDrChecks(domain, { limit: 10 })

    expect(checks).toHaveLength(2)
    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ domain_rating: 12, provider: null }),
        expect.objectContaining({ domain_rating: 32, provider: "ahrefs-history" }),
      ])
    )
    expect(d1.calls.some((call) => call.method === "batch")).toBe(true)
  })

  it("upserts subscriptions and normalizes D1 boolean fields on active/latest reads", async () => {
    const { db } = await importDbWithD1()

    const upserted = await db.upsertSubscription({
      email: "Billing@Example.com",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
      stripePriceId: "price_123",
      billingInterval: "monthly",
      domainsLimit: 25,
      status: "active",
      currentPeriodEnd: new Date("2999-01-01T00:00:00Z"),
      cancelAtPeriodEnd: true,
    })
    await db.upsertSubscription({
      email: "expired@example.com",
      stripeSubscriptionId: "sub_expired",
      status: "active",
      currentPeriodEnd: new Date("2000-01-01T00:00:00Z"),
      cancelAtPeriodEnd: false,
    })

    const active = await db.getActiveSubscriptionByEmail("billing@example.com")
    const latest = await db.getLatestSubscriptionByEmail("billing@example.com")
    const expired = await db.getActiveSubscriptionByEmail("expired@example.com")

    expect(upserted?.cancel_at_period_end).toBe(true)
    expect(active?.cancel_at_period_end).toBe(true)
    expect(latest?.cancel_at_period_end).toBe(true)
    expect(expired).toBeNull()
  })

  it("upserts duplicate billing audit events by stripe_event_id and normalizes booleans", async () => {
    const { db, d1 } = await importDbWithD1()

    await db.insertBillingAudit({
      stripeEventId: "evt_123",
      stripeEventType: "customer.subscription.updated",
      email: "Billing@Example.com",
      success: false,
      cancelAtPeriodEnd: false,
      error: "initial failure",
    })
    const updated = await db.insertBillingAudit({
      stripeEventId: "evt_123",
      stripeEventType: "customer.subscription.updated",
      email: "billing@example.com",
      success: true,
      cancelAtPeriodEnd: true,
      error: "resolved",
    })
    const latest = await db.getLatestBillingAuditEvent()
    const failure = await db.getLatestBillingAuditFailure()

    expect(d1.state.billingAudit).toHaveLength(1)
    expect(updated).toMatchObject({ stripe_event_id: "evt_123", success: true, cancel_at_period_end: true })
    expect(latest).toMatchObject({ stripe_event_id: "evt_123", success: true, cancel_at_period_end: true })
    expect(failure).toBeNull()
  })

  it("returns the removed count when pruning billing audit rows", async () => {
    const { db, d1 } = await importDbWithD1()

    await db.insertBillingAudit({
      stripeEventId: "evt_old",
      stripeEventType: "customer.subscription.updated",
      success: true,
    })
    await db.insertBillingAudit({
      stripeEventId: "evt_new",
      stripeEventType: "customer.subscription.updated",
      success: true,
    })
    d1.state.billingAudit.find((row) => row.stripe_event_id === "evt_old").created_at =
      "2000-01-01T00:00:00.000Z"

    const dryRun = await db.countPrunableBillingAudit({ olderThanDays: 30 })
    expect(dryRun.count).toBe(1)
    expect(d1.state.billingAudit).toHaveLength(2)

    const result = await db.pruneBillingAudit({ olderThanDays: 30 })
    expect(result.removed).toBe(1)
    expect(d1.state.billingAudit.map((row) => row.stripe_event_id)).toEqual(["evt_new"])
  })
})
