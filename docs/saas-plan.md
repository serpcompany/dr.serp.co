# SaaS build plan

## Product decisions
- Billing model: per email
- Limits: block new claims when the domain limit is reached and show upgrade prompt

## Delivery phases

### Phase 1: Billing core (in progress)
- Stripe Checkout + webhook verification
- Persist subscription state in `dr_subscriptions`

### Phase 2: Entitlements + access control (next)
- Entitlement resolver (plan + status + domain limit)
- Enforce limit on claim creation
- Paid-only feature gating
- Upgrade prompts

### Phase 3: Customer self-service
- Stripe Customer Portal access
- Billing status UI (plan + renewal date)

### Phase 4: Ops + reliability
- Audit log of billing changes
- Monitoring + alerting
- Rate limits on billing endpoints

## Quality, testing, and SRE (cross-cutting)
- Unit tests for webhook verification, entitlement logic, and edge cases
- Integration tests for checkout + claim enforcement
- Observability: webhook failure alerts + event replay runbook
- Data reconciliation jobs (Stripe vs DB)
