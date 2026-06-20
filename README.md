# dr.serp.co

Next.js (App Router) app for generating public Domain Rating (DR) pages and embeddable badges.

**Live site:** [https://dr.serp.co](https://dr.serp.co)

## Features

- **Public DR pages** — Shareable page for any domain showing its Ahrefs Domain Rating
- **Embeddable badges** — Dynamic SVG badges with verified DR scores
- **Domain claiming** — Verify ownership via email OTP and manage your sites
- **DR history** — Track rating changes over time

## Quick Start

```bash
npm install
npm run dev
```

## Documentation

- [Badges](docs/badges.md) — Badge styles, embedding, and configuration
- [Tutorials](docs/tutorials/) — How-to guides

## Routes

| Route | Description |
|-------|-------------|
| `/add` | Add a domain, sign in, and generate an embeddable badge |
| `/sites/:domain` | Public page (DR + badge + embed snippet) |
| `/badge/:domain` | Dynamic SVG badge |
| `/pricing` | Pricing plans |
| `/billing` | Billing status and portal access |
| `POST /api/auth/request-otp` | Send email OTP |
| `POST /api/auth/verify-otp` | Verify OTP |
| `POST /api/billing/status` | Billing status + entitlement API |
| `GET /api/ahrefs/domain-rating?target=...` | DR lookup API |
| `POST /api/stripe/portal` | Stripe customer portal session |
| `GET /api/stripe/webhook/health` | Webhook health status |
| `GET /api/admin/subscriptions` | Admin subscription report |

## Environment Variables

See `.env.example`. Key variables:

| Variable | Description |
|----------|-------------|
| `USESEND_API_KEY` | UseSend API key for email |
| `USESEND_FROM` | From address (e.g. `DR Checker <no-reply@mail.serp.co>`) |
| `USESEND_OTP_SECRET` | OTP secret (defaults to API key) |
| `DR_PUBLIC_BASE_URL` | Public base URL used to build `/sites/:domain` profile links (default: `https://dr.serp.co`) |
| `DR_BADGE_BASE_URL` | Badge URL (default: `https://embeds.serp.co`) |
| `AHREFS_API_KEY` | Ahrefs API v3 key for live Domain Rating lookups |
| `STRIPE_SECRET_KEY` | Stripe API secret key |
| `STRIPE_PRICE_IDS` | JSON map of price IDs for tiers |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PORTAL_RETURN_URL` | Optional return URL for billing portal |
| `DR_ADMIN_TOKEN` | Token for admin subscription report endpoint |
| `SENTRY_DSN` | Sentry DSN for server-side error monitoring |
| `SERP_DR_DB` | Cloudflare D1 binding for app data |
| `RATE_LIMITER` | Cloudflare Durable Object binding for rate limiting |

## Database

Production runs on Cloudflare Workers/OpenNext and uses D1 through the `SERP_DR_DB` binding. Rate limits use the `RATE_LIMITER` Durable Object binding.

If none are set (common in local/dev), the app falls back to an in-memory store and persists to `.cache/dr-fallback.json`.

## License

MIT
