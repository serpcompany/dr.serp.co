# Billing deployment checklist

## Environment variables (deployment platform)
Set these in your hosting provider (Vercel, Render, etc.). Do not commit secrets.

- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_IDS` (JSON map of monthly + annual price IDs)
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PORTAL_RETURN_URL` (optional, defaults to `/billing`)
- `DR_ADMIN_TOKEN` (for `/api/admin/subscriptions`)
- `SENTRY_DSN` and/or `NEXT_PUBLIC_SENTRY_DSN`
- Rate limit knobs: `CHECKOUT_RATE_LIMIT_POINTS`, `CHECKOUT_RATE_LIMIT_DURATION`, `STRIPE_WEBHOOK_RATE_LIMIT_POINTS`, `STRIPE_WEBHOOK_RATE_LIMIT_DURATION`, `BILLING_PORTAL_RATE_LIMIT_POINTS`, `BILLING_PORTAL_RATE_LIMIT_DURATION`
- Optional Redis store: `RATE_LIMIT_REDIS_URL`

## Monitoring
- Add an uptime monitor to `GET /api/stripe/webhook/health`.
- Alert when:
  - HTTP status is not 200
  - response `ok` is `false`
  - `status` is `stale` or `degraded`
- Optional: run `node scripts/check-webhook-health.mjs` from a cron runner.
