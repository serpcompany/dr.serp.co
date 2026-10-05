# Documentation

This folder contains documentation for [dr.serp.co](https://dr.serp.co).

## Contents

### Guides

- [Badges](badges.md) — Badge styles, embedding options, and configuration
- [Features](features.md) — Paid plan tiers, included features, and Stripe setup notes
- [SaaS Plan](saas-plan.md) — Delivery phases and billing/entitlement decisions

### Tutorials

- [How to Get Ahrefs DR Without API](tutorials/how-to-get-ahrefs-dr-without-api.md) — Research on public DR checker services

### Knowledge Base

The `knowledge/` folder contains internal reference documentation.
- [Auth Sessions And Claims](knowledge/auth-sessions.md) — OTP sign-in, the `dr_session` cookie, and claim ownership rules.
- [Billing Ops](knowledge/billing-ops.md) — Billing endpoints, audit logs, rate limits, and monitoring notes.
- [Invalid Domain Cleanup](knowledge/invalid-domain-cleanup.md) — Domain validation, scanner-probe and spam filtering, and the purge for junk rows.
- [Site Lookup Loading And Badge Fallback](knowledge/site-lookup-loading-and-badge-fallback.md) — Why fresh DR checks can feel slow and why missing badge values must render as `0`.

### Runbooks

- [Git Workflow](runbooks/gitflow.md) — Branch, PR, commit, and Cloudflare deploy workflow for this repo.
- [Stripe Event Replay](runbooks/stripe-event-replay.md) — How to resend webhook events safely.
- [Billing Deployment](runbooks/billing-deployment.md) — Deployment env vars and monitoring checklist.

## Project Overview

dr.serp.co is a Next.js app that provides:

1. **Public DR Pages** (`/sites/:domain`) — Shareable pages displaying a domain's Ahrefs Domain Rating with embed code
2. **Dynamic Badges** (`/badge/:domain`) — SVG badges that show the verified DR score
3. **Domain Claiming** — Email OTP verification to claim and manage domains
4. **DR History** — Track rating changes over time with historical data

## Architecture

```
src/
├── app/
│   ├── badge/[target]/     # Dynamic SVG badge route
│   ├── sites/[target]/     # Public domain page
│   ├── api/                # API routes (auth, DR lookup, claims)
│   └── pricing/            # Pricing page
├── components/             # React components
├── server/                 # Server-side utilities (DB, OTP, DR providers)
└── lib/                    # Shared utilities
svgs/badges/                # SVG badge templates
```

## Key Environment Variables

| Variable | Description |
|----------|-------------|
| `USESEND_API_KEY` | UseSend API key for OTP emails |
| `USESEND_OTP_SECRET` | Secret that signs OTP tokens and `dr_session` cookies (rotating it signs everyone out) |
| `DR_PUBLIC_BASE_URL` | Public base URL used to build `/sites/:domain` profile links (default: `https://dr.serp.co`) |
| `DR_BADGE_BASE_URL` | Badge base URL (default: `https://embeds.serp.co`) |
| `STRIPE_SECRET_KEY` | Stripe API secret key |
| `STRIPE_PRICE_IDS` | JSON map of Stripe price IDs |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PORTAL_RETURN_URL` | Optional portal return URL |
| `DR_ADMIN_TOKEN` | Admin token for subscription report endpoint |
| `SERP_DR_DB` | Cloudflare D1 binding for app data |
| `RATE_LIMITER` | Cloudflare Durable Object binding for rate limiting |

## Database

Production traffic is served by Cloudflare Workers/OpenNext and uses D1 through the `SERP_DR_DB` binding. Rate limits use the `RATE_LIMITER` Durable Object binding.

If no DB env vars are set (common in local/dev), the app falls back to an in-memory store and persists to `.cache/dr-fallback.json`.

See the main [README](../README.md) for the full list.
