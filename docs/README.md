# Documentation

This folder contains documentation for [dr.serp.co](https://dr.serp.co).

## Contents

### Guides

- [Badges](badges.md) — Badge styles, embedding options, and configuration
- [Features](features.md) — Paid plan tiers, included features, and Stripe setup notes

### Tutorials

- [How to Get Ahrefs DR Without API](tutorials/how-to-get-ahrefs-dr-without-api.md) — Research on public DR checker services

### Knowledge Base

The `knowledge/` folder contains internal reference documentation.

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
| `POSTGRES_URL` | Neon/Vercel Postgres connection |
| `USESEND_API_KEY` | UseSend API key for OTP emails |
| `DR_PUBLIC_BASE_URL` | Public URL (default: `https://dr.serp.co`) |
| `DR_BADGE_BASE_URL` | Badge base URL (default: `https://embeds.serp.co`) |

See the main [README](../README.md) for the full list.
