-- Fixtures for local development (`pnpm db:seed:local`), never for Staging or Production.
-- Re-running replaces the same rows. Emails are example.com addresses.
DELETE FROM dr_billing_audit WHERE stripe_event_id LIKE 'evt_seed_%';
DELETE FROM dr_subscriptions WHERE stripe_subscription_id LIKE 'sub_seed_%';
DELETE FROM dr_checks WHERE provider = 'seed';
DELETE FROM dr_claims WHERE domain IN (
  'example.com', 'example.org', 'example.net', 'wikipedia.org', 'github.com', 'claimed-site.dev',
  'bestcasinos.com', 'phpinfo.php'
);

INSERT INTO dr_claims (domain, email, domain_rating, provider, site_title, meta_description, site_url, updated_at) VALUES
  ('example.com', NULL, 93, 'seed', 'Example Domain', 'This domain is for use in documentation examples.', 'https://example.com/', '2026-10-01T00:00:00.000Z'),
  ('wikipedia.org', NULL, 96, 'seed', 'Wikipedia', 'The free encyclopedia.', 'https://www.wikipedia.org/', '2026-09-20T00:00:00.000Z'),
  ('github.com', NULL, 96, 'seed', 'GitHub', 'Where the world builds software.', 'https://github.com/', '2026-09-25T00:00:00.000Z'),
  ('claimed-site.dev', 'owner@example.com', 41, 'seed', 'A claimed site', 'Owned by the seeded subscriber.', 'https://claimed-site.dev/', '2026-10-02T00:00:00.000Z'),
  -- Unlistable rows the site must hide: spam and an invalid domain.
  ('bestcasinos.com', NULL, 60, 'seed', 'Best casinos', NULL, NULL, '2026-10-01T00:00:00.000Z'),
  ('phpinfo.php', NULL, 10, 'seed', NULL, NULL, NULL, '2026-10-01T00:00:00.000Z');

INSERT INTO dr_checks (domain, domain_rating, provider, checked_at) VALUES
  ('example.com', 92, 'seed', '2026-08-01T00:00:00.000Z'),
  ('example.com', 93, 'seed', '2026-09-01T00:00:00.000Z'),
  ('example.com', 93, 'seed', '2026-10-01T00:00:00.000Z'),
  ('example.org', 88, 'seed', '2026-10-04T00:00:00.000Z'),
  ('example.net', 85, 'seed', '2026-10-03T00:00:00.000Z'),
  ('claimed-site.dev', 39, 'seed', '2026-09-02T00:00:00.000Z'),
  ('claimed-site.dev', 41, 'seed', '2026-10-02T00:00:00.000Z');

-- A paid subscriber (sign in locally as owner@example.com). The price id isn't a real one, so
-- entitlements treat it as another product's unless STRIPE_PRICE_IDS in .dev.vars names it.
INSERT INTO dr_subscriptions (email, stripe_customer_id, stripe_subscription_id, stripe_price_id, billing_interval, domains_limit, status, current_period_end, cancel_at_period_end) VALUES
  ('owner@example.com', 'cus_seed_1', 'sub_seed_1', 'price_seed_12_monthly', 'monthly', 12, 'active', '2027-01-01T00:00:00.000Z', 0);

INSERT INTO dr_billing_audit (stripe_event_id, stripe_event_type, stripe_subscription_id, email, status, success, error, created_at) VALUES
  ('evt_seed_1', 'customer.subscription.created', 'sub_seed_1', 'owner@example.com', 'active', 1, NULL, '2026-10-01T00:00:00.000Z'),
  ('evt_seed_2', 'invoice.payment_failed', 'sub_seed_1', 'owner@example.com', 'active', 0, 'seeded failure', '2026-10-02T00:00:00.000Z');
