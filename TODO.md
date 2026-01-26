# TODO

## Billing & subscription foundation
- [ ] Add customer portal endpoint + UI entry point for self-serve billing
- [ ] Add subscription status API for the signed-in email
- [ ] Add billing status UI (plan, renewal date, payment status)

## Entitlements & access control
- [ ] Implement entitlement resolver (plan + status + domain limit)
- [ ] Enforce domain limit on new claims (block + upgrade prompt)
- [ ] Gate paid-only features based on active subscription
- [ ] Add upgrade prompt UX for limit exceeded

## Operations & reliability
- [ ] Add billing audit log entries for webhook events
- [ ] Add error monitoring (Sentry) for billing + webhooks
- [ ] Add rate limiting for checkout + webhook endpoints

## Data & reporting
- [ ] Add admin report for subscriptions (status, plan, domains used)
- [ ] Add retention rules for billing records (if needed)
