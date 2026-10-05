# Billing deployment checklist

## Environment variables
Set these in Cloudflare Worker secrets or approved non-secret vars. Do not commit secrets.

- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_IDS` (JSON map of monthly + annual price IDs)
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PORTAL_RETURN_URL` (optional, defaults to `/billing`)
- `DR_ADMIN_TOKEN` (for `/api/admin/subscriptions`)
- Rate limit knobs: `CHECKOUT_RATE_LIMIT_POINTS`, `CHECKOUT_RATE_LIMIT_DURATION`, `STRIPE_WEBHOOK_RATE_LIMIT_POINTS`, `STRIPE_WEBHOOK_RATE_LIMIT_DURATION`, `BILLING_PORTAL_RATE_LIMIT_POINTS`, `BILLING_PORTAL_RATE_LIMIT_DURATION`, `RECHECK_RATE_LIMIT_POINTS`, `RECHECK_RATE_LIMIT_DURATION`, `NEW_SITE_LOOKUP_RATE_LIMIT_POINTS`, `NEW_SITE_LOOKUP_RATE_LIMIT_DURATION`, `NEW_SITE_LOOKUP_DAILY_LIMIT`
- `RATE_LIMITER` Durable Object binding, configured in `wrangler.jsonc`

## Maintenance
- `npm run billing:reconcile` compares Stripe to app subscription records. Set `DR_ADMIN_BASE_URL` or `DR_PUBLIC_BASE_URL` plus `DR_ADMIN_TOKEN` to target a deployed Worker.
- `npm run billing:prune-audit -- --days 180` dry-runs billing audit cleanup.
- `npm run billing:prune-audit -- --days 180 --apply` deletes old audit rows after approval.

## Monitoring
- Add an uptime monitor to `GET /api/stripe/webhook/health`.
- Alert when:
  - HTTP status is not 200
  - response `ok` is `false`
  - `status` is `stale` or `degraded`
- Optional: run `npm run webhook:health` from a cron runner.
