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
| `POSTGRES_URL` | Neon/Vercel Postgres connection string |
| `USESEND_API_KEY` | UseSend API key for email |
| `USESEND_FROM` | From address (e.g. `DR Checker <no-reply@mail.serp.co>`) |
| `USESEND_OTP_SECRET` | OTP secret (defaults to API key) |
| `DR_PUBLIC_BASE_URL` | Public URL (default: `https://dr.serp.co`) |
| `DR_BADGE_BASE_URL` | Badge URL (default: `https://embeds.serp.co`) |
| `STRIPE_SECRET_KEY` | Stripe API secret key |
| `STRIPE_PRICE_IDS` | JSON map of price IDs for tiers |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PORTAL_RETURN_URL` | Optional return URL for billing portal |
| `DR_ADMIN_TOKEN` | Token for admin subscription report endpoint |
| `SENTRY_DSN` | Sentry DSN for server-side error monitoring |
| `RATE_LIMIT_REDIS_URL` | Optional Redis URL for shared rate limiting |

## Database

The app runs on Vercel and uses Neon Postgres via `@neondatabase/serverless`, configured through environment variables (see `src/server/db.mjs`):

- `POSTGRES_URL` (primary)
- or `POSTGRES_URL_NON_POOLING`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `STORAGE_URL`, `STORAGE_URL_NON_POOLING`

If none are set (common in local/dev), the app falls back to an in-memory store and persists to `.cache/dr-fallback.json`.

## License

MIT
