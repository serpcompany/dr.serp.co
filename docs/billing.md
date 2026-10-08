# Billing

What the site sells, how Stripe is wired in, and how to operate it. Moving Stripe behind a
provider interface and the SERP orders module is
[#49](https://github.com/serpcompany/dr.serp.co/issues/49).

## Plans

One subscription, sold in four sizes by how many domains the subscriber can claim. Annual
billing costs 10 times the monthly price, so two months are free.

| Domains | Monthly | Annual |
| --- | --- | --- |
| 12 | $4 | $40 |
| 25 | $7 | $70 |
| 50 | $15 | $150 |
| 100 | $27 | $270 |

- **A subscription belongs to the email address Stripe has for the customer.** Checkout fills in
  the signed-in email; a signed-out buyer types one into Stripe, and the plan applies once they
  sign in with that address.
- **Every size has the same features;** only the domain limit differs. At the limit, new claims are
  refused and the UI offers an upgrade ([Accounts and claims](accounts-and-claims.md)).
- **What a plan gives** is listed in [Accounts and claims](accounts-and-claims.md#what-a-paid-plan-gives-a-claimed-domain).
  The pricing page (`src/lib/pricing.ts`) also lists features that don't exist yet, such as email
  notifications, a weekly recap and a leaderboard. What to do about them is
  [#53](https://github.com/serpcompany/dr.serp.co/issues/53).

## Stripe setup

- One product, "SERP DR Pro Subscription", with eight prices: a monthly and an annual price for
  each size.
- `STRIPE_PRICE_IDS` maps them as JSON: `{"monthly":{"12":"price_…",…},"annual":{"12":"price_…",…}}`.
  `src/lib/stripe-pricing.ts` refuses a map that lacks any size, and the sizes must match
  `src/lib/pricing.ts`.
- Prices are created with `stripe products create` and `stripe prices create`. The Stripe CLI uses
  test mode unless given `--live`, so check which account and mode it is on first. Only the owner
  creates live products and prices.

## Endpoints

None of them reads an email from the request body. The portal and billing status need a session;
checkout uses the session's email when there is one.

- `POST /api/stripe/checkout` opens a subscription-mode Checkout Session, returning to
  `/pricing?checkout=success` or `/pricing?checkout=cancelled`.
- `POST /api/stripe/portal` opens the Stripe customer portal for plan changes and payment details,
  returning to `STRIPE_PORTAL_RETURN_URL` or `/billing`.
- `POST /api/billing/status` returns the subscriber's entitlement and subscription for `/billing`.
- `GET /api/admin/subscriptions` (admin token) reports every subscription and its domain usage.

Checkout and the portal build their return URLs from `DR_PUBLIC_BASE_URL`, never from the
request's `Origin` header, which the client controls. `npm run cf:preview` builds with
`--env=preview`, so a test checkout there returns to the deployed preview Worker, not to
localhost; use `npm run dev` for a local round trip.

## Webhooks

Stripe sends events to `https://dr.serp.co/api/stripe/webhook`, which verifies the signature
with `STRIPE_WEBHOOK_SECRET` and handles:

- `checkout.session.completed`;
- `customer.subscription.created`, `customer.subscription.updated` and
  `customer.subscription.deleted`;
- `invoice.paid` and `invoice.payment_failed`.

The Stripe account ("SERP SAAS") also sells SERP Lists Pro and SERP Subscriptions Premium, and
the endpoint receives their events too. The handler syncs a subscription only when its price is
one of dr.serp.co's (`STRIPE_PRICE_IDS`); it records any other as a successful audit row with
the error "Ignored: not a dr.serp.co price." and no customer details. Entitlements likewise
grant nothing for a row whose price isn't a dr.serp.co tier.

Each event updates `dr_subscriptions` and writes one row to `dr_billing_audit`, which records
success or the error and is unique on the Stripe event ID, so a replayed event is recorded once,
with the replay's result and error replacing the earlier ones.

A payload follows the endpoint's API version, `2025-06-30.basil`, while the SDK's own API calls
use `2023-10-16`. Basil moved an invoice's subscription to `parent.subscription_details` and a
subscription's period end onto its items, so the handler reads both shapes. Changing the
endpoint's version can change payloads again; check the handler and its tests first.

## Monitoring

`GET /api/stripe/webhook/health` returns `ok` and a `status`:

- `missing`: no webhook event recorded yet;
- `stale`: none in the last `STRIPE_WEBHOOK_STALE_HOURS` (24 by default). With few subscribers,
  a quiet day can be stale without anything being wrong;
- `degraded`: a failed event in the last `STRIPE_WEBHOOK_FAILURE_WINDOW_MINUTES` (60);
- `ok` otherwise.

`npm run webhook:health` exits non-zero unless the status is `ok`, for a cron or uptime monitor.

## Operations

These scripts call the admin API at `DR_ADMIN_BASE_URL`, or else at `DR_PUBLIC_BASE_URL` (the
local dev server in `.dev.vars.example`), when `DR_ADMIN_TOKEN` is set. Only `DR_ADMIN_BASE_URL`
reaches Production. Without a base URL or token they run against the local fallback store.
Neither local target proves anything about production.

- `npm run billing:reconcile` compares Stripe's subscriptions with `dr_subscriptions`.
- `npm run billing:prune-audit -- --days 180` reports audit rows older than 180 days, and deletes
  them with `--apply` once the owner approves.

## Replaying a failed event

The webhook answers a failed event with a fixed message, so Stripe's Dashboard doesn't show why it
failed. The reason is in the event's `dr_billing_audit.error` and in the Worker logs.

1. In the Stripe Dashboard, open **Developers → Webhooks**, choose the `dr.serp.co` endpoint, find
   the event under **Events** and choose **Replay**. With the CLI:
   `stripe events resend <event-id> --webhook-endpoint <endpoint-id>`.
2. Check that `/api/stripe/webhook/health` reports the new event, and run
   `npm run billing:reconcile` against Production to confirm `dr_subscriptions` matches Stripe.
