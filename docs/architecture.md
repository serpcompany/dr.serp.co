# Architecture

How a request moves through dr.serp.co, which layer owns what, and where data and configuration
come from. The site is one Next.js App Router app built by OpenNext into a Cloudflare Worker.

## The request path

Every request reaches the Worker entry, `cloudflare-worker.js`, which does three things around
OpenNext:

1. **Slash redirect.** A path ending in `/` (other than `/`, `/_next/*` and `/favicon.ico`) gets a
   308 to the same path without it. This includes `/api/*`, which the SERP URL standard forbids;
   [#51](https://github.com/serpcompany/dr.serp.co/issues/51) decides the rule.
2. **Next.js,** through `.open-next/worker.js`.
3. **Cache header parity.** A `GET` or `HEAD` response with no `Cache-Control`, or with OpenNext's
   default `s-maxage=31536000`, gets `public, max-age=0, must-revalidate`. Skipped for `/_next/*`,
   `/favicon.ico`, `/api/admin/*`, 5xx responses and responses that set a cookie.

The entry also exports `RateLimitDurableObject`, the class behind the `RATE_LIMITER` binding. Its
logic lives in `src/server/`, and each part has tests next to it.

`next dev` doesn't run the Worker entry, so slash redirects and cache headers only show up in
`npm run cf:preview` or a deployed Worker.

## Layers

- **Pages** (`src/app/**/page.tsx`) are server components that read through `src/server/`.
  Client components are for interaction only and call route handlers with `fetch`.
- **Route handlers** (`src/app/api/**/route.ts`) do every write a visitor asks for. There are no
  Server Actions. Two reads also write: rendering `/sites/<domain>` stores a lookup while the
  domain has no DR, and metadata while its title, description or URL is missing, within the
  new-lookup caps for a domain with no DR ([DR lookups](dr-lookups.md#when-ahrefs-is-called)), and
  `GET /badge/<domain>` copies the latest `dr_checks` reading into `dr_claims` when that row has no
  DR.
- **`src/server/`** holds the domain logic and is server-only: data access, DR providers, site
  metadata, domain validation, the spam filter, sign-in tokens and sessions, entitlements and rate
  limits. It never imports pages, route handlers or components. `src/server/db.mjs` is the only
  module with SQL.
- **`src/lib/`** holds shared helpers: pricing tiers, the Stripe client, env validation and the
  browser's list of recently viewed sites.

## Pages

- `/` and `/sites` list tracked sites, highest DR first, with search. Only listable domains
  appear: valid and not spam.
- `/sites/<domain>` shows a site's DR, its history chart, metadata and the badge embed code. The
  first visit to an unknown domain looks its DR up ([DR lookups](dr-lookups.md)).
- `/<domain>` redirects to `/sites/<domain>`, and to `/` when the domain is invalid.
- `/add` adds a domain and signs in; `/pricing` and `/billing` are the paid plan pages.
- `/badge/<domain>` returns the SVG badge ([Badges](badges.md)).

`/`, `/sites` and `/sites/<domain>` render on every request. `/add`, `/pricing` and `/billing`
are prerendered at build time, and their client components call route handlers for account data.
There is no Next.js data cache, no ISR and no OpenNext incremental cache.

## Data

D1, bound as `SERP_DR_DB` in every environment, holds four tables
(`migrations/0001_initial_d1_schema.sql`):

- `dr_claims`: one row per domain. The latest DR, the owner's email when claimed, and site
  metadata (title, description, URL, screenshot).
- `dr_checks`: every DR reading, the source of the history chart.
- `dr_subscriptions` and `dr_billing_audit`: Stripe state and the webhook log
  ([Billing](billing.md)).

`src/server/db.mjs` reads the binding through `getCloudflareContext()` on each call. Without a
Cloudflare context outside production, which is `next dev`, it uses an in-memory store saved to
`.cache/dr-fallback.json`, so `next dev` never touches D1. `npm run cf:preview` runs against
local D1 in `.wrangler/`. In production, a missing binding throws. Replacing the fallback with
local D1 and moving to Drizzle is [#48](https://github.com/serpcompany/dr.serp.co/issues/48).

Site search matches the domain with `instr()`, never `LIKE`, because D1 refuses a `LIKE` pattern
over 50 bytes ([D1 limits](https://github.com/serpcompany/serp/blob/main/docs/engineering/technology/cloudflare-d1-limits.md)).
`normalizeSearchQuery` collapses whitespace, keeps 100 characters and folds only ASCII case, as
SQLite's `lower()` does. `src/server/sql-patterns.test.ts` fails on a bound `LIKE` or `GLOB`
pattern, and `src/server/db-workerd.test.ts` runs search on D1 in workerd, which enforces the
limit. The listable filter runs in JavaScript, so `listSites` reads the rows up to the requested
page plus 200, and reads further (doubling) only when unlistable rows leave the page short. A
page past offset 100,000 is empty. `countSites` still reads each matching domain and title; #75 moves both into SQL.

## Rate limits

`checkRateLimit` in `src/server/rate-limit.mjs` keeps a fixed-window counter per key in the
`RATE_LIMITER` Durable Object, which makes it consistent across isolates. If the Durable Object
fails, the request is refused. Without the binding (`next dev`), it counts in memory.

## Configuration

- **Non-secret values** are per-environment `vars` in `wrangler.jsonc`.
- **Secrets** are Worker secrets per environment. `secrets.required` in `wrangler.jsonc` lists
  them.
- **Local values** are in `.dev.vars` (template: `.dev.vars.example`).

Code reads `process.env`, which OpenNext fills from the Worker's environment on each request.
Some modules still read it at load time, and `src/lib/env.ts` caches it.
[#46](https://github.com/serpcompany/dr.serp.co/issues/46) moves every read into the request.

## External services

- **Ahrefs API v3:** DR and DR history ([DR lookups](dr-lookups.md)).
- **Microlink:** site metadata and a homepage screenshot, with a direct HTML fetch as fallback.
- **useSend:** sign-in code emails ([Accounts and claims](accounts-and-claims.md)).
- **Stripe:** checkout, the customer portal and webhooks ([Billing](billing.md)).
