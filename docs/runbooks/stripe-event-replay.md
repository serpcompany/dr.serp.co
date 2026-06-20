# Stripe event replay runbook

## When to use
- Webhook delivery failed or data needs to be re-processed.

## Replay from Stripe Dashboard
1. Go to **Developers → Webhooks** in Stripe.
2. Select the endpoint for `dr.serp.co`.
3. Open the **Events** tab and locate the event.
4. Click **Replay** and confirm the delivery.
5. Verify ingestion via `GET /api/stripe/webhook/health` or the billing audit log.

## Replay with Stripe CLI
```bash
stripe events resend evt_123 --webhook-endpoint we_123
```

## Verify
- Check `dr_billing_audit` for a new entry.
- Confirm subscription state in `dr_subscriptions` was updated.
- On Cloudflare, verify through `GET /api/stripe/webhook/health` and `npm run billing:reconcile` with `DR_ADMIN_BASE_URL` and `DR_ADMIN_TOKEN` set.
