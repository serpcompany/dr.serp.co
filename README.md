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
| `POST /api/auth/request-otp` | Send email OTP |
| `POST /api/auth/verify-otp` | Verify OTP |
| `GET /api/ahrefs/domain-rating?target=...` | DR lookup API |

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

## License

MIT
