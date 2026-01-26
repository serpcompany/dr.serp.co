# Billing ops notes

- **Billing status API**: `POST /api/billing/status` with `{ email }` returns entitlement + subscription details for UI.
- **Customer portal**: `POST /api/stripe/portal` with `{ email }` returns a Stripe portal session URL.
- **Admin report**: `GET /api/admin/subscriptions` with `x-admin-token: $DR_ADMIN_TOKEN` returns subscription + usage stats.
- **Webhook health**: `GET /api/stripe/webhook/health` returns `ok`, `status`, and last event timestamps. Hook this into your uptime monitor to alert when `ok=false`.
- **Audit log**: Webhook events are recorded in `dr_billing_audit` (success/error) and persisted in the fallback store during local dev.
- **Retention**: Use `node scripts/prune-billing-audit.mjs [days]` to trim old audit records (defaults to 180 days).
- **Reconciliation**: Run `node scripts/reconcile-stripe-subscriptions.mjs` to compare Stripe vs DB records.
- **Rate limits**: Checkout, portal, and webhook endpoints use in-memory rate limiting; tune via env vars in `.env.example`. For multi-instance deployments, swap to a shared store (e.g., Redis) via `rate-limiter-flexible`.
- **Sentry**: Billing routes capture exceptions with `@sentry/nextjs` when `SENTRY_DSN` is configured.
