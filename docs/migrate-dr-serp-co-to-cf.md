# Migrate dr.serp.co To Cloudflare

Status: planning document based on local repo audit.

Source repo:

- Local path: `/Users/devin/dev/repos/dr.serp.co`
- Git remote: `https://github.com/serpcompany/dr.serp.co.git`
- Current hosting: Vercel
- Current database: Neon/Vercel Postgres
- Target hosting: Cloudflare Workers
- Target database: Cloudflare D1, pending schema validation

## Executive Summary

`dr.serp.co` is much smaller than `tools.serp.co`, but it has more business-state risk. The app handles domain claims, DR checks/history, subscription state, Stripe webhooks, billing audit records, OTP email, and rate limiting.

The migration is plausible as a Cloudflare Workers + D1 project, but it should be treated as a careful stateful migration rather than a static app deployment. The highest-risk areas are Stripe webhook correctness, subscription entitlement reads, database parity, and replacing Redis-backed rate limiting.

Unlike `tools.serp.co`, this repo does not have many native binary processing endpoints. That makes a Worker migration more feasible. The database layer is currently a large hand-written Neon SQL module, so the main implementation work is moving that DB layer to D1 cleanly.

Recommended migration shape:

1. Add OpenNext Cloudflare Worker deployment.
2. Convert the `src/server/db.mjs` persistence layer to D1 through project code.
3. Replace Redis rate limiting with a Cloudflare-native mechanism.
4. Validate Stripe webhooks and subscription state on preview before production.
5. Cut over DNS only after payment, claim, badge, and DR flows are proven.

## Current Repo Facts

Local audit findings:

- Single Next.js app, not a monorepo.
- Package name: `dr.serp.co`.
- Git remote is already under `serpcompany`.
- Vercel project metadata exists in `.vercel`.
- `vercel.json` exists and uses `@vercel/next`.
- No `.github` workflow files were present in the audited checkout.
- Node engine currently: `>=20 <23`.
- App route surface:
  - About 22 app page/route files.
  - 15 route handlers under `src/app`.
- Source size:
  - About 251 files excluding `.git`, `.next`, `.vercel`, `node_modules`, and local assistant folders.
  - `src/server/db.mjs` is about 1,613 lines.
- Current dirty local files in audited checkout:
  - `TODO.md`
  - untracked `.claude/`
- Those local changes should not be touched unless explicitly requested.

## Current Stack

Application:

- Next.js 15.5.x App Router.
- React 19.
- Sentry for Next.js.
- Tailwind/Radix-style UI components.
- Node runtime is forced on many pages/routes with `export const runtime = "nodejs"`.

Data:

- Neon via `@neondatabase/serverless`.
- `@vercel/postgres` is also installed.
- DB connection reads from:
  - `POSTGRES_URL`
  - `POSTGRES_URL_NON_POOLING`
  - `DATABASE_URL`
  - `DATABASE_URL_UNPOOLED`
  - `STORAGE_URL`
  - `STORAGE_URL_NON_POOLING`
- Local/dev fallback uses an in-memory store and `.cache/dr-fallback.json` when no DB is configured and `NODE_ENV !== "production"`.

Business services:

- Stripe Checkout.
- Stripe Customer Portal.
- Stripe webhook ingestion.
- Stripe subscription reconciliation script.
- Billing audit pruning script.
- UseSend OTP email.
- Ahrefs API.
- FrogDR session fallback.
- Redis-backed rate limiting via `ioredis` and `rate-limiter-flexible`.
- Sentry.
- R2 badge replacement script.

## Current Environment Variables

Documented variables include:

- `POSTGRES_URL`
- `POSTGRES_URL_NON_POOLING`
- `DATABASE_URL`
- `DATABASE_URL_UNPOOLED`
- `USESEND_API_KEY`
- `USESEND_FROM`
- `USESEND_OTP_SECRET`
- `DR_PUBLIC_BASE_URL`
- `DR_BADGE_BASE_URL`
- `AHREFS_API_KEY`
- `FROGDR_SESSION`
- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_IDS`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PORTAL_RETURN_URL`
- `CHECKOUT_RATE_LIMIT_POINTS`
- `CHECKOUT_RATE_LIMIT_DURATION`
- `BILLING_PORTAL_RATE_LIMIT_POINTS`
- `BILLING_PORTAL_RATE_LIMIT_DURATION`
- `STRIPE_WEBHOOK_RATE_LIMIT_POINTS`
- `STRIPE_WEBHOOK_RATE_LIMIT_DURATION`
- `STRIPE_WEBHOOK_STALE_HOURS`
- `STRIPE_WEBHOOK_FAILURE_WINDOW_MINUTES`
- `BILLING_AUDIT_RETENTION_DAYS`
- `DR_ADMIN_TOKEN`
- `WEBHOOK_HEALTH_URL`
- `SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_TRACES_SAMPLE_RATE`
- `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`
- `RATE_LIMIT_REDIS_URL`
- `REDIS_URL`
- `R2_BADGE_BUCKET`

Migration implication:

- Production Worker should not require `DATABASE_URL`, `POSTGRES_URL`, or Redis URLs after migration.
- Cloudflare Worker secrets must replace Vercel env storage.
- Stripe webhook and OTP secrets must be installed as Cloudflare secrets before preview validation.

## Current Database Tables

`src/server/db.mjs` creates four tables:

- `dr_claims`
- `dr_checks`
- `dr_subscriptions`
- `dr_billing_audit`

### `dr_claims`

Purpose:

- Domain ownership/claim data.
- Latest DR snapshot fields.
- Site presentation metadata.

Important fields:

- `domain` primary key.
- `email`.
- `domain_rating`.
- `provider`.
- `site_title`.
- `meta_description`.
- `site_url`.
- `screenshot_url`.
- `claimed_at`.
- `updated_at`.

### `dr_checks`

Purpose:

- DR history/check records.

Important fields:

- `id` big serial primary key.
- `domain`.
- `domain_rating`.
- `provider`.
- `checked_at`.
- Index on `(domain, checked_at desc)`.

### `dr_subscriptions`

Purpose:

- Stripe subscription state and entitlement backing.

Important fields:

- `id` big serial primary key.
- `email`.
- `stripe_customer_id`.
- `stripe_subscription_id` unique.
- `stripe_price_id`.
- `billing_interval`.
- `domains_limit`.
- `status`.
- `current_period_end`.
- `cancel_at_period_end`.
- `created_at`.
- `updated_at`.

### `dr_billing_audit`

Purpose:

- Stripe webhook and billing event audit trail.

Important fields:

- `id` big serial primary key.
- `stripe_event_id` unique.
- `stripe_event_type`.
- `stripe_customer_id`.
- `stripe_subscription_id`.
- `stripe_price_id`.
- `email`.
- `billing_interval`.
- `domains_limit`.
- `status`.
- `current_period_end`.
- `cancel_at_period_end`.
- `event_created_at`.
- `success`.
- `error`.
- `created_at`.

## Current DB API Surface

`src/server/db.mjs` exports about 24 async functions:

- `getClaim`
- `upsertClaim`
- `setClaimEmail`
- `clearClaimEmail`
- `touchDomain`
- `setClaimSiteMetadata`
- `recordDrCheck`
- `recordDrHistoryChecks`
- `getDrChecks`
- `listClaims`
- `countClaims`
- `listClaimsByEmail`
- `countClaimsByEmail`
- `listSites`
- `countSites`
- `purgeInvalidSiteDomains`
- `upsertSubscription`
- `getActiveSubscriptionByEmail`
- `getLatestSubscriptionByEmail`
- `listSubscriptions`
- `insertBillingAudit`
- `getLatestBillingAuditEvent`
- `getLatestBillingAuditFailure`
- `pruneBillingAudit`

Migration implication:

- Do not rewrite call sites first.
- Preserve this module boundary and replace the implementation behind the exported functions.
- Add tests for D1 behavior at this boundary.

## PostgreSQL Features To Convert

Current SQL uses PostgreSQL-specific behavior:

- `BIGSERIAL`.
- `TIMESTAMPTZ`.
- `NOW()`.
- `ILIKE`.
- `NULLS LAST`.
- `GREATEST`.
- `LEFT JOIN LATERAL`.
- `ON CONFLICT`.
- `RETURNING`.
- `COALESCE`.

D1/SQLite equivalents or rewrites are needed:

- Replace `BIGSERIAL` with `integer primary key autoincrement`.
- Use integer timestamps or ISO text timestamps consistently.
- Replace `NOW()` with app-generated timestamps or SQLite datetime functions.
- Replace `ILIKE` with normalized lowercase search or `LIKE` with collation considerations.
- Rewrite `NULLS LAST` sorting where needed.
- Rewrite `LEFT JOIN LATERAL` queries for latest check per domain.
- Validate `RETURNING` support through D1 and Wrangler before relying on it.
- Preserve `ON CONFLICT` semantics for Stripe idempotency.

## Target Cloudflare Stack

Core app:

- Cloudflare Workers.
- OpenNext Cloudflare adapter.
- `wrangler.jsonc`.
- `nodejs_compat` where needed.
- Static assets binding.
- OpenNext self-reference service binding.
- Production custom domain: `dr.serp.co`.
- Preview Worker without inheriting the production custom domain.

Data:

- Cloudflare D1.
- Binding name: `SERP_DR_DB`.
- Databases:
  - `serp-dr-prod`
  - `serp-dr-preview`

Rate limiting:

Pick a Cloudflare-native replacement:

- Cloudflare Rate Limiting binding for simple request limits.
- Durable Object for strict per-key counters.
- KV for approximate cooldown state.
- Signed cooldown cookies can remain where appropriate, but shared enforcement needs a Worker-compatible backing store.

Secrets:

- Store private values through Cloudflare Worker secrets.
- GitHub Actions deploy secrets:
  - `CLOUDFLARE_ACCOUNT_ID`
  - `CLOUDFLARE_API_TOKEN`
- App secrets:
  - `USESEND_API_KEY`
  - `USESEND_OTP_SECRET`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PRICE_IDS`
  - `AHREFS_API_KEY`
  - `FROGDR_SESSION`, if still used
  - `DR_ADMIN_TOKEN`
  - Sentry DSNs and sample rates

Optional Cloudflare resources:

- R2 for badge assets if badge replacement remains part of this project.
- Cron Triggers for scheduled cleanup/reconciliation jobs, if those scripts should become scheduled platform tasks.

## Lessons From devinschumacher.com Migration

These are operational lessons from the `devinschumacher.com` Vercel-to-Cloudflare move that should be applied here before cutover:

- Choose one deployment authority per branch:
  - Cloudflare Worker deploys through GitHub Actions/Wrangler; or
  - Cloudflare dashboard-connected builds; or
  - another documented deploy pipeline.
- Do not leave Vercel deploy hooks and Cloudflare deploy hooks both acting as production deploy authorities after the Cloudflare path works.
- Verify Cloudflare GitHub integration access before relying on dashboard "Connect to repository" flows. If OAuth/install access is invalid, use GitHub Actions with `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.
- Separate build-time env from runtime Worker secrets:
  - public `NEXT_PUBLIC_*` values needed during the Next/OpenNext build go in CI/build env;
  - Stripe, OTP, Ahrefs, D1, Redis replacement, and admin secrets belong in Cloudflare Worker secrets/bindings;
  - do not copy Vercel env dumps wholesale.
- Audit and remove unused CMS/admin/build surfaces before migration. The `devinschumacher.com` migration removed unused TinaCMS infrastructure that was adding build steps, admin assets, API routes, and secrets without powering production content.
- Remove Vercel-specific config, README/docs language, deploy workflows, and env dependencies only after Cloudflare preview and production deploys are validated.
- After deleting routes, handlers, or generated admin assets, regenerate Next/OpenNext artifacts before trusting `tsc`; stale `.next/types` can report deleted routes until a fresh build.
- Confirm production cutover with response headers (`curl -I https://dr.serp.co/`) before retiring Vercel/Neon/Redis. Cloudflare custom domain verification/DNS propagation can lag, so keep rollback infrastructure alive until production is visibly served by Cloudflare.

## Lessons From tools.serp.co Migration

These are concrete lessons from the `tools.serp.co` Cloudflare migration that should be applied to this stateful migration:

- Write the Cloudflare operations runbook before cutover, not after. It should document the Cloudflare account, Worker names, workers.dev URLs, production host, `wrangler` config path, D1 binding names, database names/IDs, migration directory, table schema, approved access commands, dashboard/admin routes, cache/static-asset bindings, secrets policy, and rollback path.
- Establish an immutable migration baseline before live checks: current Vercel URL, target Worker URL, commit SHA, build command, deploy command, env/binding inventory, Stripe/Cloudflare token availability, and the exact production base URL values.
- Do a generated route-manifest crawl instead of relying only on representative smoke tests. The `tools.serp.co` crawl caught route-level issues such as category pages that were easy to miss manually. For `dr.serp.co`, generate the manifest from `src/app` plus dynamic samples for `/{target}`, `/sites/{target}`, and `/badge/{target}`.
- Compare both slash and no-slash variants where the current app responds to both or redirects. Record expected redirect status and `Location` values so Cloudflare does not introduce accidental 404s or canonical changes.
- Treat SEO/static routes as explicit parity gates. If `robots.txt`, `sitemap.xml`, sitemap indexes, or `ads.txt` are intentionally absent, document that. If any are added before cutover, compare exact XML/text content and exact URL values between Vercel and Cloudflare.
- Verify hydrated browser states, not only raw HTML. In the tools migration, a duplicated client-rendered extension CTA only appeared after interaction. For `dr.serp.co`, browser checks should cover OTP modals/forms, claim/recheck states, billing buttons, checkout redirects, portal redirects, admin-token views, and loading/error states.
- Treat `next build`, OpenNext build, and `wrangler deploy` as separate gates. A direct Next build can pass while OpenNext/Wrangler exposes runtime, binding, or asset issues. If a deploy build fails with a generic Next/OpenNext error, reproduce it directly with tracing before changing code.
- Inspect the actual `wrangler deploy` binding summary and keep it in the audit notes. D1 binding output can be confusing when preview IDs are configured, so use explicit project commands for preview versus production migrations and migration-status checks.
- Keep generated deploy artifacts out of commits. Wrangler/OpenNext can leave local directories such as `.wrangler`, `.open-next`, or `.next`; confirm `.gitignore` coverage and clean generated artifacts before committing.
- Use browser/API smoke tests for third-party integrations after deploy. On `tools.serp.co`, third-party ad scripts could load while fill failed on workers.dev/headless. For `dr.serp.co`, the equivalent risk is Stripe, UseSend, Ahrefs/FrogDR, Sentry, and any webhook health callback.
- Keep the Vercel, Neon, and Redis rollback path available through the observation window. Do not remove old services immediately after a successful deploy; first verify real production traffic, logs, Stripe webhook delivery, D1 write/read behavior, and admin reporting.

## Lessons From dlp.yt Migration

These are operational lessons from the `dlp.yt` Vercel-to-Cloudflare cutover that should make this migration smoother:

- Decide the long-term Cloudflare deployment authority before creating production resources. A Cloudflare Pages Direct Upload project could not be converted into a Git-connected project later, which forced creating a second project and doing a custom-domain move. For `dr.serp.co`, create the Worker, GitHub Actions/Wrangler workflow, and production route in the final desired shape from the start.
- Verify Cloudflare permissions before the cutover window. Pages/project permissions were enough to create deployments and attach custom domains, but they were not enough to read or edit zone DNS records. For `dr.serp.co`, the operator or token used during cutover must have the required account Worker permissions plus zone DNS/route permissions for `serp.co`.
- Treat custom-domain health and DNS/route ownership as separate checks. `curl -I` showing `server: cloudflare` proves traffic is on Cloudflare, but it does not prove the intended Worker/project owns the hostname. Record the Cloudflare API/dashboard evidence for the active route/custom domain in the cutover notes.
- Do not remove the old production host until the new Cloudflare target has the custom domain attached, DNS/route validation is active, and live route/API smoke tests pass. During `dlp.yt`, moving the custom domain before matching DNS was corrected caused `522`, so rollback infrastructure had to stay available.
- If a generated Cloudflare preview hostname remains reachable after cutover, document whether that is acceptable. Custom domains do not automatically mean the generated preview hostname redirects to production. If canonicalization matters, add an explicit redirect rule or Worker-level host redirect and test path/query preservation.
- Validate the exact commit that Cloudflare deployed. A later commit pushed during cutover can supersede an earlier successful deployment and fail the Cloudflare build. Always compare the local `HEAD`, remote `origin/main`, and Cloudflare latest deployment commit before declaring production current.
- When removing fallback UI or route branches, keep the surrounding render path syntactically complete and run the same build that Cloudflare runs. In `dlp.yt`, deleting a fallback ribbon branch left an incomplete ternary that failed only at build time.
- Set kill switches or temporary safety flags on the project that is actually serving production, not only on the new replacement project. Verify with a live API request that the flag short-circuits before third-party/provider calls.
- Keep legacy API behavior intentional. If old Vercel endpoints are retired instead of preserved, return explicit `410`/replacement responses where possible and check logs for active consumers before final deletion.

## Migration Plan

### Phase 1: Baseline Audit

- Record the immutable baseline:
  - current Vercel production URL.
  - target Cloudflare workers.dev URL.
  - commit SHA.
  - build and deploy commands.
  - Node version.
  - env var inventory.
  - Cloudflare bindings.
  - Cloudflare account ID, zone ID, Worker names, route/custom-domain owner, and the token/operator permissions available for DNS and route changes.
  - Stripe webhook endpoint.
  - dashboard/admin token availability.
- Record the current production deployment authority and every active deploy hook or Git integration so Vercel and Cloudflare do not both deploy production after cutover.
- Confirm current production behavior for:
  - `/`
  - `/add`
  - `/sites`
  - `/sites/{domain}`
  - `/{target}`
  - `/badge/{target}`
  - `/pricing`
  - `/billing`
  - `/api/ahrefs/domain-rating`
  - `/api/auth/request-otp`
  - `/api/auth/verify-otp`
  - `/api/claims`
  - `/api/my-sites`
  - `/api/recheck`
  - `/api/sites`
  - `/api/billing/status`
  - `/api/stripe/checkout`
  - `/api/stripe/portal`
  - `/api/stripe/webhook`
  - `/api/admin/subscriptions`
  - `/api/admin/sites/cleanup-invalid`
- Capture current headers and redirects.
- Generate a route manifest from `src/app` and include dynamic sample values for:
  - `/{target}`
  - `/sites/{target}`
  - `/badge/{target}`
- Include slash and no-slash variants in the manifest where production currently redirects or serves both.
- Confirm intended behavior for SEO/static files:
  - `robots.txt`
  - `sitemap.xml`
  - sitemap indexes, if added before migration
  - `ads.txt`, if added before migration
- Confirm canonical production base URL values:
  - `DR_PUBLIC_BASE_URL=https://dr.serp.co`
  - `DR_BADGE_BASE_URL=https://dr.serp.co` or current production badge base.
- Confirm current Stripe webhook endpoint in Stripe Dashboard.
- Confirm current Vercel/Neon production env values outside the repo.
- Confirm whether the generated Cloudflare preview hostname should remain public, redirect to `dr.serp.co`, or be disabled where possible.

### Phase 2: Cloudflare Worker Shell

- Add `@opennextjs/cloudflare`.
- Add `open-next.config.ts`.
- Add `wrangler.jsonc`.
- Add Worker scripts:
  - preview build/deploy.
  - production deploy.
  - type generation.
  - Wrangler dry-runs.
- Update Node CI target to Node 24.
- Add production Worker:
  - name: `serp-dr`
  - route: `dr.serp.co`
- Add preview Worker:
  - name: `serp-dr-preview`
  - no production custom domain route.
- Configure and verify Worker platform features explicitly:
  - Workers Static Assets binding.
  - OpenNext self-reference service binding.
  - R2 incremental cache binding if this app uses OpenNext ISR/data cache.
  - Workers Logs observability.
  - Smart Placement if it improves Stripe/Ahrefs/D1 latency.
- Add or verify `.gitignore` entries for generated deployment artifacts:
  - `.wrangler/`
  - `.open-next/`
  - `.next/`
- Create `docs/knowledge/cloudflare-operations.md` before cutover and include the Worker, D1, secrets, cache/static assets, approved access commands, and rollback details.
- Preserve Sentry integration or adjust it for Workers compatibility.
- Add GitHub Actions or another explicit deployment path, and avoid leaving Vercel as an active production deploy path once Cloudflare is validated.
- Include only build-time public env values in CI; install private runtime values as Cloudflare Worker secrets/bindings.

### Phase 3: D1 Schema

- Create D1 databases:
  - `serp-dr-preview`
  - `serp-dr-prod`
- Add D1 migration directory.
- Write baseline D1 schema for:
  - `dr_claims`
  - `dr_checks`
  - `dr_subscriptions`
  - `dr_billing_audit`
- Preserve indexes:
  - `dr_checks(domain, checked_at desc)`
  - `dr_subscriptions(email)`
  - `dr_subscriptions(stripe_customer_id)`
  - `dr_billing_audit(email)`
  - `dr_billing_audit(stripe_subscription_id)`
  - `dr_billing_audit(created_at desc)`
- Use app-generated timestamps where it simplifies cross-runtime behavior.
- Use SQLite integer booleans for `cancel_at_period_end` and `success`.
- Document the final D1 schema and indexes in `docs/knowledge/cloudflare-operations.md`.
- Add approved D1 access commands to the runbook. Do not rely on ad-hoc database shell sessions for migration verification.

### Phase 4: D1 Runtime DB Layer

- Keep `src/server/db.mjs` as the public boundary.
- Replace Neon client internals with a D1-backed implementation.
- Add a small helper to access `SERP_DR_DB` from the Worker runtime.
- Keep a local fallback only for development, not production.
- Remove production use of:
  - `POSTGRES_URL`
  - `DATABASE_URL`
  - `@neondatabase/serverless`
  - `@vercel/postgres`
- Rewrite SQL queries for SQLite/D1.
- Add tests for all DB boundary functions.

### Phase 5: Data Migration

- Build a project script for data import.
- Source is the existing Neon/Postgres database export, but access must go through approved project tooling.
- Include dry-run mode.
- Include row-count reporting.
- Required tables:
  - `dr_claims`
  - `dr_checks`
  - `dr_subscriptions`
  - `dr_billing_audit`
- Import preview first.
- Run parity checks.
- Import production only after preview passes.
- Check D1 migration status through Wrangler/project scripts and confirm pending migrations are zero before each import.
- Keep migration/import outputs in repo-local `tmp/` only when needed, and clean those temporary files after verification.

Parity checks:

- Row counts by table.
- Sample claimed domains.
- Sample recent DR checks.
- Sample active subscriptions.
- Sample canceled subscriptions.
- Latest billing audit event.
- Latest billing audit failure.
- Admin subscriptions report.
- Entitlement checks for active/trialing/past-due/canceled statuses.

### Phase 6: Rate Limiting

- Replace `ioredis` and `rate-limiter-flexible`.
- Preserve current limits:
  - checkout.
  - billing portal.
  - Stripe webhook.
- Select implementation:
  - Cloudflare Rate Limiting for simple endpoint protection.
  - Durable Object for strict app-level counters.
  - KV for lighter cooldown semantics.
- Add tests for allowed, limited, and reset behavior.
- Remove `RATE_LIMIT_REDIS_URL` and `REDIS_URL` from production requirements.

### Phase 7: Stripe Validation

Stripe is the highest-risk runtime workflow.

Validate on preview:

- Checkout session creation.
- Customer portal session creation.
- Webhook signature verification using raw request body.
- Events:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - invoice/payment events handled by the current route.
- Idempotency via `stripe_event_id`.
- Subscription upsert by `stripe_subscription_id`.
- Billing audit success and failure insertion.
- Webhook health endpoint.
- Stripe event replay runbook.

Do not cut production traffic until Stripe preview replay passes.

### Phase 8: Preview Validation

Deploy preview Worker and validate:

- public pages.
- full generated route manifest parity against Vercel:
  - status codes.
  - redirects and `Location` headers.
  - slash/no-slash behavior.
  - content type.
  - canonical URLs.
  - title/meta markers on HTML pages.
  - cache headers.
  - body sanity checks for unexpected 404/500 pages.
- domain add/claim flow.
- OTP email flow.
- DR lookup through Ahrefs or FrogDR.
- site metadata enrichment.
- badge rendering.
- pricing page.
- checkout and portal.
- webhook replay.
- billing page.
- admin routes with token.
- Sentry reporting.
- D1 query behavior.
- rate limiting behavior.
- hydrated browser states:
  - OTP request/verify UI.
  - claim email state.
  - recheck button state.
  - checkout button and redirect.
  - portal button and redirect.
  - admin token view.
  - loading and error states.
- SEO/static route behavior for `robots.txt`, sitemap routes, and `ads.txt` if they exist by this phase.

### Phase 9: Production Cutover

- Deploy production Worker.
- Save the `wrangler deploy` binding summary in the cutover notes and verify it names the expected D1 database, assets binding, service binding, env vars, and custom domain trigger.
- Confirm Cloudflare latest deployment commit matches the intended local/remote commit before changing DNS or routes.
- Apply production D1 migrations.
- Import production data.
- Validate Worker production URL before domain cutover.
- Attach `dr.serp.co` custom domain or Worker route.
- Verify Cloudflare dashboard/API route ownership for `dr.serp.co`; do not rely only on `curl` headers.
- Update Stripe webhook endpoint if needed.
- Delete or replace Vercel DNS record in Cloudflare DNS.
- Confirm DNS/route propagation before removing Vercel aliases:
  - `curl -I https://dr.serp.co/` returns the expected Cloudflare response.
  - `www` or other alternate hostnames redirect exactly as intended, preserving path and query string where required.
  - generated `workers.dev` or preview host behavior matches the documented decision.
- Validate:
  - homepage.
  - add flow.
  - claimed domain page.
  - badge URL.
  - billing status.
  - checkout.
  - portal.
  - webhook health.
  - admin subscriptions.
  - Cloudflare logs.
- Validate no stale production writes are still landing in Neon/Redis after the Cloudflare route is active.

### Phase 10: Vercel, Neon, Redis Cleanup

Only after Cloudflare production is stable:

- Re-check Cloudflare route/custom-domain ownership and live `dr.serp.co` API/page smoke tests immediately before deleting Vercel resources.
- Remove Vercel domain assignment.
- Disable Vercel deploy hooks.
- Remove `vercel.json`.
- Remove Vercel env docs.
- Remove unused admin/CMS build outputs and stale deployment docs that existed only for Vercel.
- Remove Neon/Postgres runtime dependencies:
  - `@neondatabase/serverless`
  - `@vercel/postgres`
- Remove Redis dependencies if unused:
  - `ioredis`
  - `rate-limiter-flexible`
- Remove production docs references to Neon/Vercel.
- Keep old Neon database available briefly for rollback and audit.
- Shut down Neon only after parity and stable production traffic are confirmed.

## Validation Checklist

Static checks:

- `npm run lint`
- `npm run test`
- `npm run build`
- OpenNext build.
- Wrangler dry-run for preview and production.
- `wrangler deploy` dry run or preview deploy output shows expected bindings.
- Generated deployment artifacts are ignored or cleaned before commit.
- Cloudflare operations runbook is current before DNS cutover.

Database checks:

- D1 migrations apply locally.
- D1 migrations apply to preview.
- D1 migrations apply to production after preview passes.
- D1 migration-status check reports no pending migrations.
- Row counts match.
- Representative rows match.
- Stripe event idempotency works.
- Claims and site listings sort correctly.
- Search behavior matches expected case-insensitive behavior.

Runtime checks:

- Full route-manifest parity crawl has no unexplained 404/500/status/redirect/canonical mismatches.
- No production dependency on `DATABASE_URL`.
- No production dependency on Redis URLs.
- Worker binding `SERP_DR_DB` is present.
- Secrets are installed in preview and production.
- Stripe webhook validates raw body.
- OTP flow sends email.
- Badge route renders SVG/image correctly.
- Ahrefs/FrogDR provider behavior is unchanged.
- Hydrated browser flows pass for OTP, claim/recheck, checkout, portal, and admin-token states.
- SEO/static files either match Vercel exactly or are documented as intentionally absent.

## Rollback

Before removing Vercel:

- Keep Vercel production project active.
- Keep Neon production database active.
- Rollback is DNS back to Vercel.
- Stripe webhook endpoint can be moved back to the Vercel URL if needed.

After removing Vercel/Neon:

- Rollback requires restoring the prior commit and database source or restoring from backups.
- Do not delete Neon until Cloudflare production has been stable and D1 backup/export strategy is confirmed.

## Open Decisions

- Should `src/server/db.mjs` remain hand-written SQL, or should the project adopt Drizzle for D1?
- Should local fallback `.cache/dr-fallback.json` remain after D1 migration?
- Which Cloudflare rate limiting primitive should replace Redis?
- Should R2 badge assets be bound to the Worker or remain managed only by scripts?
- Should billing cleanup/reconciliation scripts become Cloudflare Cron Triggers?
- Should FrogDR remain a production provider?

## Recommended Next Step

Start with a D1 proof of concept behind the existing `src/server/db.mjs` boundary.

Recommended order:

1. Convert schema to D1 locally.
2. Implement D1 versions of the DB boundary functions.
3. Run the existing tests plus new DB parity tests.
4. Validate Stripe webhook behavior on a preview Worker.
5. Only then build the full production cutover.
