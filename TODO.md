# TODO

## Phase 1: Billing core
- [x] Add customer portal endpoint + UI entry point for self-serve billing
- [x] Add subscription status API for the signed-in email
- [x] Add billing status UI (plan, renewal date, payment status)
- [x] Add webhook signature verification tests (happy + tampered signature)
- [x] Add checkout API tests (invalid tier, invalid billing, missing envs)

## Phase 2: Entitlements + access control
- [x] Implement entitlement resolver (plan + status + domain limit)
- [x] Enforce domain limit on new claims (block + upgrade prompt)
- [x] Gate paid-only features based on active subscription
- [x] Add upgrade prompt UX for limit exceeded
- [x] Add entitlement unit tests (active, trialing, past_due, canceled, grace)
- [x] Add integration test for claim limit enforcement

## Phase 3: Customer self-service
- [x] Add Stripe Customer Portal access
- [x] Add billing status UI entry points on pricing + dashboard

## Phase 4: Ops + reliability
- [x] Add billing audit log entries for webhook events
- [x] Add error monitoring (Sentry) for billing + webhooks
- [x] Add rate limiting for checkout + webhook endpoints
- [x] Add health checks + alerting for webhook failures
- [x] Add Stripe event replay runbook
- [ ] Configure Sentry project + DSN and alert rules for billing/webhook errors
- [ ] Set up external uptime monitor for `/api/stripe/webhook/health`

## Phase 5: Data + reporting
- [x] Add admin report for subscriptions (status, plan, domains used)
- [x] Add retention rules for billing records (if needed)
- [x] Add data reconciliation script (Stripe vs DB)
- [ ] Schedule `scripts/prune-billing-audit.mjs` in production (cron)
