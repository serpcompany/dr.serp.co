# Stripe webhooks

- Webhook endpoint: `/api/stripe/webhook`
- Requires `STRIPE_WEBHOOK_SECRET` for signature verification.
- Handles checkout completion + subscription lifecycle events and persists subscription state in `dr_subscriptions`.
- Writes audit entries to `dr_billing_audit` (success + errors).
- Health check endpoint: `GET /api/stripe/webhook/health` for monitoring.
- Recommended Stripe events:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`
