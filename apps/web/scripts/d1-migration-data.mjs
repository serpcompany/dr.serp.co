const claimColumns = [
  'domain',
  'email',
  'domain_rating',
  'provider',
  'site_title',
  'meta_description',
  'site_url',
  'screenshot_url',
  'claimed_at',
  'updated_at'
]

const checkColumns = ['domain', 'domain_rating', 'provider', 'checked_at']

const subscriptionColumns = [
  'email',
  'stripe_customer_id',
  'stripe_subscription_id',
  'stripe_price_id',
  'billing_interval',
  'domains_limit',
  'status',
  'current_period_end',
  'cancel_at_period_end',
  'created_at',
  'updated_at'
]

const billingAuditColumns = [
  'stripe_event_id',
  'stripe_event_type',
  'stripe_customer_id',
  'stripe_subscription_id',
  'stripe_price_id',
  'email',
  'billing_interval',
  'domains_limit',
  'status',
  'current_period_end',
  'cancel_at_period_end',
  'event_created_at',
  'success',
  'error',
  'created_at'
]

function toIsoText(value) {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : String(value)
}

function toInteger(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Math.floor(Number(value))
  return Number.isFinite(number) ? number : null
}

function toBooleanInteger(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number') return value === 0 ? 0 : 1
  const normalized = String(value).trim().toLowerCase()
  if (!normalized) return null
  return normalized === '0' || normalized === 'false' || normalized === 'no' ? 0 : 1
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'NULL'
    return String(value)
  }
  return `'${String(value).replaceAll("'", "''")}'`
}

function insertStatements(table, columns, rows, mapper) {
  if (!rows.length) return []
  const quotedColumns = columns.join(', ')
  return rows.map(row => {
    const values = columns.map(column => sqlLiteral(mapper(row, column))).join(', ')
    return `INSERT INTO ${table} (${quotedColumns}) VALUES (${values});`
  })
}

export function normalizeMigrationData(data) {
  const claims = (data.claims ?? [])
    .map(row => ({
      domain: String(row.domain ?? '').trim(),
      email: row.email ?? null,
      domain_rating: toInteger(row.domain_rating),
      provider: row.provider ?? null,
      site_title: row.site_title ?? null,
      meta_description: row.meta_description ?? null,
      site_url: row.site_url ?? null,
      screenshot_url: row.screenshot_url ?? null,
      claimed_at: toIsoText(row.claimed_at) ?? new Date(0).toISOString(),
      updated_at:
        toIsoText(row.updated_at) ?? toIsoText(row.claimed_at) ?? new Date(0).toISOString()
    }))
    .filter(row => row.domain)

  const checks = (data.checks ?? [])
    .map(row => ({
      domain: String(row.domain ?? '').trim(),
      domain_rating: toInteger(row.domain_rating),
      provider: row.provider ?? null,
      checked_at: toIsoText(row.checked_at) ?? new Date(0).toISOString()
    }))
    .filter(row => row.domain && row.domain_rating !== null)

  const subscriptions = (data.subscriptions ?? [])
    .map(row => ({
      email: String(row.email ?? '')
        .trim()
        .toLowerCase(),
      stripe_customer_id: row.stripe_customer_id ?? null,
      stripe_subscription_id: String(row.stripe_subscription_id ?? '').trim(),
      stripe_price_id: row.stripe_price_id ?? null,
      billing_interval: row.billing_interval ?? null,
      domains_limit: toInteger(row.domains_limit),
      status: row.status ?? null,
      current_period_end: toIsoText(row.current_period_end),
      cancel_at_period_end: toBooleanInteger(row.cancel_at_period_end),
      created_at: toIsoText(row.created_at) ?? new Date(0).toISOString(),
      updated_at:
        toIsoText(row.updated_at) ?? toIsoText(row.created_at) ?? new Date(0).toISOString()
    }))
    .filter(row => row.email && row.stripe_subscription_id)

  const billingAudit = (data.billingAudit ?? [])
    .map(row => ({
      stripe_event_id: row.stripe_event_id ?? null,
      stripe_event_type: String(row.stripe_event_type ?? '').trim(),
      stripe_customer_id: row.stripe_customer_id ?? null,
      stripe_subscription_id: row.stripe_subscription_id ?? null,
      stripe_price_id: row.stripe_price_id ?? null,
      email: row.email ? String(row.email).trim().toLowerCase() : null,
      billing_interval: row.billing_interval ?? null,
      domains_limit: toInteger(row.domains_limit),
      status: row.status ?? null,
      current_period_end: toIsoText(row.current_period_end),
      cancel_at_period_end: toBooleanInteger(row.cancel_at_period_end),
      event_created_at: toIsoText(row.event_created_at),
      success: toBooleanInteger(row.success) ?? 1,
      error: row.error ?? null,
      created_at: toIsoText(row.created_at) ?? new Date(0).toISOString()
    }))
    .filter(row => row.stripe_event_type)

  return { claims, checks, subscriptions, billingAudit }
}

export function summarizeMigrationData(data) {
  return {
    claims: data.claims?.length ?? 0,
    checks: data.checks?.length ?? 0,
    subscriptions: data.subscriptions?.length ?? 0,
    billingAudit: data.billingAudit?.length ?? 0
  }
}

export function buildD1ImportSql(input, { generatedAt = new Date().toISOString() } = {}) {
  const data = normalizeMigrationData(input)
  const statements = [
    '-- Generated D1 import for dr.serp.co.',
    `-- Generated at ${generatedAt}.`,
    '-- This import replaces the target D1 data set. Apply only to the intended migration target.',
    '-- Do not add explicit transaction statements; Wrangler D1 remote execute rejects them.',
    'PRAGMA foreign_keys = OFF;',
    'DELETE FROM dr_billing_audit;',
    'DELETE FROM dr_subscriptions;',
    'DELETE FROM dr_checks;',
    'DELETE FROM dr_claims;',
    ...insertStatements('dr_claims', claimColumns, data.claims, (row, column) => row[column]),
    ...insertStatements('dr_checks', checkColumns, data.checks, (row, column) => row[column]),
    ...insertStatements(
      'dr_subscriptions',
      subscriptionColumns,
      data.subscriptions,
      (row, column) => row[column]
    ),
    ...insertStatements(
      'dr_billing_audit',
      billingAuditColumns,
      data.billingAudit,
      (row, column) => row[column]
    ),
    ''
  ]

  return {
    sql: statements.join('\n'),
    summary: summarizeMigrationData(data)
  }
}
