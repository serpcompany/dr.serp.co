# Billing ops notes

- **Billing status API**: `POST /api/billing/status` (session cookie required) returns entitlement + subscription details for UI.
- **Customer portal**: `POST /api/stripe/portal` (session cookie required) returns a Stripe portal session URL.
- **Admin report**: `GET /api/admin/subscriptions` with `x-admin-token: $DR_ADMIN_TOKEN` returns subscription + usage stats.
- **Webhook health**: `GET /api/stripe/webhook/health` returns `ok`, `status`, and last event timestamps. Hook this into your uptime monitor to alert when `ok=false`.
- **Health script**: `npm run webhook:health` exits non-zero on unhealthy status (use in cron/monitors).
- **Audit log**: Webhook events are recorded in `dr_billing_audit` (success/error) and persisted in the fallback store during local dev.
- **Retention**: Use `npm run billing:prune-audit -- --days 180` to dry-run retention and `npm run billing:prune-audit -- --days 180 --apply` after approval to delete old audit rows.
- **Reconciliation**: Run `node scripts/reconcile-stripe-subscriptions.mjs` to compare Stripe vs DB records.
  - Set `DR_ADMIN_BASE_URL` or `DR_PUBLIC_BASE_URL` plus `DR_ADMIN_TOKEN` to compare Stripe against a deployed Cloudflare Worker. Without those vars, the script uses the local project DB API and should not be treated as production evidence.
- **Rate limits**: Checkout, portal, and webhook endpoints use the `RATE_LIMITER` Durable Object binding on Cloudflare and in-memory fallback only when no binding is available for local development.
