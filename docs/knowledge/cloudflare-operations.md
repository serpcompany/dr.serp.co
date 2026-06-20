# Cloudflare operations

Status: production traffic for `dr.serp.co` is live on Cloudflare Workers/OpenNext with D1. Vercel, Neon/Postgres, and Redis remain the rollback path through the observation window.

## Current authority

- Production hostname: `dr.serp.co`
- Production Worker name: `serp-dr`
- Preview Worker name: `serp-dr-preview`
- Production Worker custom domain: `dr.serp.co` on zone `serp.co`.
- Public DNS now resolves `dr.serp.co` through Cloudflare and normal requests return `server: cloudflare` with `x-opennext: 1`. Worker hostname ownership is managed by the Wrangler custom domain entry, not a legacy `dr.serp.co/*` route. Do not remove Vercel/Neon/Redis until after Cloudflare traffic is stable.
- Deployment authority: GitHub Actions or Wrangler may deploy only after the release owner approves the target environment. Local commands in this checkpoint are dry-run or local preview only.
- Wrangler config: `wrangler.jsonc`
- OpenNext config: `open-next.config.ts`
- Worker entry: `cloudflare-worker.js`, which delegates fetch handling to `.open-next/worker.js` and exports this app's custom `RateLimitDurableObject`. Keep any OpenNext internal Durable Object re-exports separate if future caching features add them.
- D1 migrations directory: `migrations/`
- Temporary artifacts: keep all ad-hoc export/import/check files under `./tmp/`, never `/tmp/`, and clean them before finishing the task that created them.

## Bindings

- Static assets: `ASSETS` -> `.open-next/assets`
- OpenNext self service: `WORKER_SELF_REFERENCE`
- D1 database binding: `SERP_DR_DB`
- Rate limit Durable Object binding: `RATE_LIMITER`
- Rate limit Durable Object class: `RateLimitDurableObject`

Cloudflare resources currently configured in `wrangler.jsonc`:

- Preview D1 name: `serp-dr-preview`
- Preview D1 ID: `e461f27e-6d8f-4bd3-9216-537e9642bad5`
- Preview Worker host: `https://serp-dr-preview.serpcompany.workers.dev`
- Production D1 name: `serp-dr-prod`
- Production D1 ID: `0a6e5e69-60e4-4145-a84a-3f8c9177ad0c`
- Current production Worker version validated after custom domain deploy: `db2a76fb-1be5-4f8a-bacb-376d4457da80`

Target D1 database names:

- Preview: `serp-dr-preview`
- Production: `serp-dr-prod`

## Secrets and vars

Do not commit secret values. Install secrets through Cloudflare Dashboard or `wrangler secret put` after explicit approval for the target environment.

Required Worker secrets:

- `AHREFS_API_KEY`
- `DR_ADMIN_TOKEN`
- `STRIPE_PRICE_IDS`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `USESEND_API_KEY`
- `USESEND_FROM`
- `USESEND_OTP_SECRET`

Non-secret vars currently declared in `wrangler.jsonc`:

- `NEXTJS_ENV`
- `DR_PUBLIC_BASE_URL`
- `DR_BADGE_BASE_URL`

Operator scripts can target a deployed Worker by setting:

- `DR_ADMIN_BASE_URL`: preview or production Worker origin for admin maintenance scripts.
- `DR_ADMIN_TOKEN`: admin API token, sent as `x-admin-token`.

Later checkpoints should confirm whether these existing Vercel/Node env vars remain needed on Cloudflare:

- `FROGDR_SESSION`
- `NEXT_PUBLIC_BASE_URL`
- `STRIPE_PORTAL_RETURN_URL`
- `CHECKOUT_RATE_LIMIT_POINTS`
- `CHECKOUT_RATE_LIMIT_DURATION`
- `BILLING_PORTAL_RATE_LIMIT_POINTS`
- `BILLING_PORTAL_RATE_LIMIT_DURATION`
- `AHREFS_RATE_LIMIT_POINTS`
- `AHREFS_RATE_LIMIT_DURATION`
- `RECHECK_RATE_LIMIT_POINTS`
- `RECHECK_RATE_LIMIT_DURATION`
- `STRIPE_WEBHOOK_RATE_LIMIT_POINTS`
- `STRIPE_WEBHOOK_RATE_LIMIT_DURATION`
- `STRIPE_WEBHOOK_STALE_HOURS`
- `STRIPE_WEBHOOK_FAILURE_WINDOW_MINUTES`
- `BILLING_AUDIT_RETENTION_DAYS`
- `WEBHOOK_HEALTH_URL`
- `SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_TRACES_SAMPLE_RATE`
- `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`

## Approved commands

Safe local verification:

```sh
npm run build
npm run cf:build
npm run cf:types
npm run cf:preview
npm run cf:preview:dry-run
npm run cf:deploy:dry-run
npm run cf:audit
npm run routes:manifest
npm run d1:export
```

Do not run remote D1 apply/import/export commands without explicit approval in the current conversation. Do not run direct database shell commands against Neon, D1 preview, or D1 production.

Use strict audit mode only after replacing environment placeholders:

```sh
npm run cf:audit -- --strict --pretty
```

## D1 schema

Migration file: `migrations/0001_initial_d1_schema.sql`

Tables:

- `dr_claims`: domain claim, latest DR, and site presentation metadata.
- `dr_checks`: DR check history.
- `dr_subscriptions`: Stripe subscription entitlement state.
- `dr_billing_audit`: Stripe webhook/audit records.

SQLite/D1 conventions:

- Autoincrement IDs use `INTEGER PRIMARY KEY AUTOINCREMENT`.
- Timestamps are ISO-8601 UTC `TEXT`.
- Booleans are `INTEGER` values constrained to `0` or `1`.
- `stripe_event_id` idempotency is enforced by `dr_billing_audit_stripe_event_id_uq`.

Important indexes:

- `dr_checks_domain_checked_at_idx`
- `dr_subscriptions_stripe_subscription_id_uq`
- `dr_subscriptions_email_idx`
- `dr_subscriptions_customer_idx`
- `dr_billing_audit_stripe_event_id_uq`
- `dr_billing_audit_email_idx`
- `dr_billing_audit_subscription_idx`
- `dr_billing_audit_created_idx`

## Migration and import flow

Local-only schema check:

```sh
npx wrangler d1 migrations apply SERP_DR_DB --env preview --local
```

Preview apply requires explicit approval first:

```sh
npx wrangler d1 migrations apply SERP_DR_DB --env preview --remote
```

Production apply requires explicit approval first and must happen only after preview validation passes:

```sh
npx wrangler d1 migrations apply SERP_DR_DB --env production --remote
```

Data import flow for a later checkpoint:

- Export source data through project-owned scripts or ORM-safe code, not ad-hoc direct database shell commands:

```sh
npm run d1:export
```

- The export writes `./tmp/d1-migration/<prefix>.json` and `./tmp/d1-migration/<prefix>.sql`.
- Validate row counts and representative records before import.
- Get explicit approval before any D1 remote import.
- Import preview first, validate app reads/writes and Stripe idempotency, then request approval for production.
- Clean `./tmp/` artifacts before ending the import task.

Preview import requires explicit approval first:

```sh
npx wrangler d1 execute SERP_DR_DB --env preview --remote --file ./tmp/d1-migration/<prefix>.sql
```

Production import requires explicit approval first and must happen only after preview import validation passes:

```sh
npx wrangler d1 execute SERP_DR_DB --env production --remote --file ./tmp/d1-migration/<prefix>.sql
```

Latest import artifact:

- `tmp/d1-migration/latest.sql`
- Exported at: `2026-06-20T08:11:02.988Z`
- Imported rows: 77 claims, 537 DR checks, 0 subscriptions, 0 billing audit rows.
- Preview import completed against `serp-dr-preview`.
- Production import completed against `serp-dr-prod`.
- Repo-local `./tmp/d1-migration/` artifacts were cleaned after successful cutover validation; rerun `npm run d1:export` if a fresh import artifact is needed.

## Operator maintenance

These scripts prefer the Worker admin API when `DR_ADMIN_BASE_URL` or `DR_PUBLIC_BASE_URL` and `DR_ADMIN_TOKEN` are set. Without those vars they use the project DB API for local development only.

- `npm run billing:reconcile`: compare Stripe subscriptions to app subscription records.
- `npm run billing:prune-audit -- --days 180`: dry-run billing audit retention.
- `npm run billing:prune-audit -- --days 180 --apply`: delete old billing audit rows after approval.
- `npm run sites:purge-invalid`: dry-run invalid-domain cleanup.
- `npm run sites:purge-invalid -- --apply`: purge invalid-domain rows after approval.
- `npm run sites:backfill-metadata`: dry-run metadata backfill candidates.
- `npm run sites:backfill-metadata -- --apply`: resolve and write missing metadata.
- `npm run webhook:health`: check `GET /api/stripe/webhook/health`.

Webhook health can return `status: "missing"` immediately after cutover when the production D1 audit table has no Stripe webhook rows yet. Treat the endpoint as live if it returns from Cloudflare with HTTP 200, then expect `ok: true` after the first real DR Stripe webhook is delivered.

Admin endpoints:

- `GET /api/admin/subscriptions`
- `POST /api/admin/billing/prune-audit`
- `POST /api/admin/sites/cleanup-invalid`
- `POST /api/admin/sites/backfill-metadata`

Route parity:

```sh
npm run routes:manifest -- --pretty
BASE_A_URL=https://dr.serp.co BASE_B_URL=https://<preview-host> npm run routes:parity -- --pretty
```

## Rollback

- Keep Vercel production, Neon/Postgres, and Redis available through the Cloudflare observation window.
- If Cloudflare preview or production fails before DNS cutover, stop Cloudflare deploys and leave Vercel serving traffic.
- If failure occurs after DNS cutover, detach the Worker custom domain, route traffic back to the existing Vercel target, and pause additional Stripe webhook changes.
- Do not delete Neon, Redis, Vercel env vars, or Vercel project config until production Cloudflare traffic is stable and rollback is no longer required.
- D1 migrations are forward-only operationally; restore from D1 backup/export only after approval and incident notes identify the restore target.

## Cutover checklist

- Done: replace all D1 placeholder names and IDs in `wrangler.jsonc`.
- Done: confirm Cloudflare account `SERP`, zone `serp.co`, and custom domain target `dr.serp.co`.
- Done: install required Cloudflare secrets for preview and production.
- Done: run `npm run test`, `npm run build` via OpenNext, `npm run cf:types`, `npm run cf:audit -- --strict --pretty`, and dry-run deploy checks.
- Done: apply D1 migrations to preview and production.
- Done: export source data with `npm run d1:export`.
- Done: import preview and production data.
- Done: deploy preview and production Workers.
- Done: validate production Worker through Cloudflare edge using forced resolution before DNS cutover.
- Done: update Cloudflare DNS for `dr.serp.co` so traffic reaches the Worker custom domain instead of Vercel.
- Done: confirm Stripe has an enabled webhook endpoint at `https://dr.serp.co/api/stripe/webhook` with the required event set.
- Pending: monitor live Cloudflare traffic and keep rollback systems online through the observation window.
