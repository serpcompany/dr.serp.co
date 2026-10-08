-- Baseline D1 schema for dr.serp.co.
-- Timestamps are stored as ISO-8601 UTC text. Boolean values are stored as INTEGER 0/1.

CREATE TABLE IF NOT EXISTS dr_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  email TEXT,
  domain_rating INTEGER CHECK (domain_rating IS NULL OR (domain_rating >= 0 AND domain_rating <= 100)),
  provider TEXT,
  site_title TEXT,
  meta_description TEXT,
  site_url TEXT,
  screenshot_url TEXT,
  claimed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS dr_claims_domain_uq
  ON dr_claims (domain);

CREATE INDEX IF NOT EXISTS dr_claims_email_idx
  ON dr_claims (email);

CREATE INDEX IF NOT EXISTS dr_claims_updated_idx
  ON dr_claims (updated_at DESC);

CREATE INDEX IF NOT EXISTS dr_claims_domain_rating_updated_idx
  ON dr_claims (domain_rating DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS dr_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  domain_rating INTEGER NOT NULL CHECK (domain_rating >= 0 AND domain_rating <= 100),
  provider TEXT,
  checked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX IF NOT EXISTS dr_checks_domain_checked_at_idx
  ON dr_checks (domain, checked_at DESC);

CREATE INDEX IF NOT EXISTS dr_checks_checked_at_idx
  ON dr_checks (checked_at DESC);

CREATE TABLE IF NOT EXISTS dr_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT NOT NULL,
  stripe_price_id TEXT,
  billing_interval TEXT,
  domains_limit INTEGER CHECK (domains_limit IS NULL OR domains_limit >= 0),
  status TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER DEFAULT 0 CHECK (
    cancel_at_period_end IS NULL OR cancel_at_period_end IN (0, 1)
  ),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS dr_subscriptions_stripe_subscription_id_uq
  ON dr_subscriptions (stripe_subscription_id);

CREATE INDEX IF NOT EXISTS dr_subscriptions_email_idx
  ON dr_subscriptions (email);

CREATE INDEX IF NOT EXISTS dr_subscriptions_customer_idx
  ON dr_subscriptions (stripe_customer_id);

CREATE INDEX IF NOT EXISTS dr_subscriptions_email_updated_idx
  ON dr_subscriptions (email, updated_at DESC);

CREATE TABLE IF NOT EXISTS dr_billing_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_event_id TEXT,
  stripe_event_type TEXT NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  email TEXT,
  billing_interval TEXT,
  domains_limit INTEGER CHECK (domains_limit IS NULL OR domains_limit >= 0),
  status TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER DEFAULT 0 CHECK (
    cancel_at_period_end IS NULL OR cancel_at_period_end IN (0, 1)
  ),
  event_created_at TEXT,
  success INTEGER DEFAULT 1 CHECK (success IS NULL OR success IN (0, 1)),
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS dr_billing_audit_stripe_event_id_uq
  ON dr_billing_audit (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS dr_billing_audit_email_idx
  ON dr_billing_audit (email);

CREATE INDEX IF NOT EXISTS dr_billing_audit_subscription_idx
  ON dr_billing_audit (stripe_subscription_id);

CREATE INDEX IF NOT EXISTS dr_billing_audit_created_idx
  ON dr_billing_audit (created_at DESC);
