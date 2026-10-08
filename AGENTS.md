# AGENTS

dr.serp.co shows any website's Ahrefs Domain Rating (DR) on a public page, `/sites/<domain>`,
serves an embeddable DR badge, `/badge/<domain>`, and sells subscriptions that let a signed-in
user claim domains, recheck them more often and get a dofollow link. It is one Next.js App Router
app running as a Cloudflare Worker through OpenNext, with D1 for data and a Durable Object for
rate limits. Paying customers depend on it.

This file is a map. Read the doc your task needs, not all of them, and check what a doc says
against the code before relying on it.

Stage: ship

## SERP standards

This repository follows the shared standards in
[serpcompany/serp](https://github.com/serpcompany/serp/tree/main/docs/engineering/standards).
Read the ones your task touches:

- **Every change:** [git workflow](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/git-workflow.md),
  [verification cadence](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/verification-cadence.md)
  and, for reviews, the [review prompt](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/agent-harness/review-prompt.md).
- **Config, Worker entry, caching, deploys:** [Next.js on Workers](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/web-stack/nextjs-on-workers.md)
  and [environment configuration](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/environment-configuration.md).
- **Tables and queries:** [data and storage](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/web-stack/data-and-storage.md)
  and [Cloudflare D1 limits](https://github.com/serpcompany/serp/blob/main/docs/engineering/technology/cloudflare-d1-limits.md).
- **UI:** [shadcn first](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/web-stack/shadcn-first.md).
- **Claims and badges:** the [native submissions](https://github.com/serpcompany/serp/blob/main/docs/engineering/websites/features/submissions/README.md)
  spec, which names dr.serp.co as its next directory.
- **Docs:** [docs are maps](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/agent-harness/docs-are-maps.md)
  and [docs/README.md](docs/README.md).

The site is moving to the SERP web stack under
[epic #36](https://github.com/serpcompany/dr.serp.co/issues/36), one sub-issue at a time. Until
an issue lands, keep the current tools: no Drizzle, Better Auth, Biome, pnpm or `base-nova`
components ahead of their issue.

## Where things live

- `src/app/`: pages and route handlers. `src/app/api/` holds every write; there are no Server
  Actions.
- `src/server/`: server-only logic: data access (`db.mjs`, the only place with SQL), DR providers,
  domain validation, the spam filter, sign-in tokens and sessions, entitlements and rate limits.
- `src/lib/`: pricing tiers, the Stripe client and shared helpers.
- `src/components/ui/`: stock shadcn components (`new-york` on Radix until #50).
- `cloudflare-worker.js`: the Worker entry, wrapping OpenNext.
- `migrations/`: D1 migrations, raw SQL until #48.
- `scripts/`: operator and build scripts.
- `wrangler.jsonc`: Worker environments and bindings.

## Docs

- [Architecture](docs/architecture.md): the request path, layers, data, configuration and caching.
  Read it before changing the Worker entry, a layer boundary or how config is read.
- [DR lookups](docs/dr-lookups.md): when the site calls Ahrefs, the cost guards, domain validation
  and the spam filter. Read it before adding any call to a DR provider.
- [Accounts and claims](docs/accounts-and-claims.md): sign-in, sessions, claiming and entitlements.
- [Badges](docs/badges.md): the badge route, its styles and caching, and the static R2 badges.
- [Billing](docs/billing.md): plans, Stripe, webhooks and billing operations.
- [Operations](docs/operations.md): environments, secrets, deploys, D1 migrations, operator scripts
  and rollback.

## Commands

Inner loop, while editing:

- `npx vitest related --run <changed files>`: the tests for what you changed.
- `npm run dev`: `next dev` with local values from `.dev.vars`.
- Type errors in app code surface in `npm run build`. `npx tsc --noEmit` also checks test files,
  which have known errors until #42.

Finish gate, once per finished state:
`npm test && npm run cf:audit -- --strict --pretty && npm run cf:build && npm run docs:check`.

Evidence beyond the finish gate:

- **Worker entry, redirects, headers or `wrangler.jsonc`:** a run on `npm run cf:preview`.
- **Visible UI:** one local run with a screenshot at 1440 px and 390 px wide.

## Rules

- **Local values go in `.dev.vars`, never in `.env*` files.** The OpenNext build copies `.env*`
  values into the Worker bundle, and `scripts/check-bundle-env.mjs` fails the build if any are there.
- **Agents never deploy or run remote D1 commands** (`--remote`). The owner deploys with
  `npm run deploy:preview` or `npm run deploy:production`, never `wrangler deploy`, until
  [#44](https://github.com/serpcompany/dr.serp.co/issues/44) moves deploys to CI.
- **The top level of `wrangler.jsonc` is local-only.** Every remote command passes `--env`.
- **Every Ahrefs call costs API units.** A new call site keeps the guards in
  [DR lookups](docs/dr-lookups.md).
- **Scratch files go in `tmp/`**, which Git ignores, and are deleted when the task ends.

Agents never merge. The owner merges every pull request.

## Exceptions to the SERP standards

- **Email:** sign-in codes go through useSend from a no-reply sender on `mail.serp.co`, the
  serp.co-subdomain exception in the
  [transactional email](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/transactional-email.md)
  standard.
- **URLs:** pages have no trailing slash, and the Worker strips one. Whether to adopt the SERP
  rule is [#51](https://github.com/serpcompany/dr.serp.co/issues/51); don't change slash
  behavior before it's decided.
- **Rate limits** use a Durable Object (`RATE_LIMITER`), not D1.
- **Environments** are named `preview` and `production`, with `serp-dr*` resource names, until
  [#43](https://github.com/serpcompany/dr.serp.co/issues/43).
