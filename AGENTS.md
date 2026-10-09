# AGENTS

dr.serp.co shows any website's Ahrefs Domain Rating (DR) on a public page, `/sites/<domain>`,
serves an embeddable DR badge, `/badge/<domain>`, and sells subscriptions that let a signed-in
user claim domains, recheck them more often and get a dofollow link. It is one Next.js App Router
app running as a Cloudflare Worker through OpenNext, with D1 for data and a Durable Object for
rate limits. Paying customers depend on it.

This file is a map. Read the doc your task needs, not all of them, and check what a doc says
against the code before relying on it.

Stage: ship

Base branch: `main`. Branch from it as `issue-<number>-<slug>` and open pull requests into it.

## SERP standards

This repository follows the shared standards in serpcompany/serp's
[docs/engineering](https://github.com/serpcompany/serp/tree/main/docs/engineering). Read the
ones your task touches (paths below are relative to that folder):

- **Every change:** `standards/git-workflow.md`, `standards/verification-cadence.md`, and for
  reviews `standards/agent-harness/review-prompt.md`.
- **Config, Worker entry, caching, deploys:** `standards/web-stack/nextjs-on-workers.md` and
  `standards/environment-configuration.md`.
- **Tables and queries:** `standards/web-stack/data-and-storage.md` and
  `technology/cloudflare-d1-limits.md`.
- **UI:** `standards/web-stack/shadcn-first.md`.
- **Claims and badges:** the native submissions spec in `websites/features/submissions/`, which
  names dr.serp.co as its next directory.
- **Docs:** `standards/agent-harness/docs-are-maps.md` and [docs/README.md](docs/README.md).

The site is moving to the SERP web stack under
[epic #36](https://github.com/serpcompany/dr.serp.co/issues/36), one sub-issue at a time. Until
an issue lands, keep the current tools: no Drizzle, Better Auth or `base-nova` components ahead
of their issue.

## Where things live

The site is in `apps/web/`, with its own `package.json` and pnpm lockfile. Code paths here and in
`docs/` are relative to it, except paths starting with a root entry: the docs (`AGENTS.md`,
`CLAUDE.md`, `README.md`, `docs/`), `.archive/` and `.github/`. `apps/web/AGENTS.md` and `CLAUDE.md`
only carry the block `next dev` keeps.

- `src/app/`: pages and route handlers. Writes a visitor asks for are route handlers under
  `src/app/api/`; there are no Server Actions. Rendering a site page and the badge route also
  write to D1 ([Architecture](docs/architecture.md#layers)).
- `src/server/`: server-only logic: DR providers, domain validation, the spam filter, sign-in
  tokens and sessions, entitlements and rate limits.
- `src/lib/`: pricing tiers, the Stripe client and shared helpers.
- `src/components/ui/`: stock shadcn components (`new-york` on Radix until #50).
- `worker.ts`: the Worker entry, wrapping OpenNext; its concerns live in `src/lib/`.
- `src/db/`: the data layer: Drizzle schema and typed queries; `drizzle/`: its migrations.
- `scripts/`: operator and build scripts.
- `wrangler.jsonc`: Worker environments and bindings.

## Docs

- [Architecture](docs/architecture.md): the request path, layers, data, configuration and caching.
  Read it before changing the Worker entry, a layer boundary or how config is read.
- [DR lookups](docs/dr-lookups.md): when the site calls Ahrefs, the cost guards, domain validation
  and the spam filter. Read it before adding any call to a DR provider.
- [Accounts and claims](docs/accounts-and-claims.md): sign-in, sessions, claiming and entitlements.
  Read it before touching sign-in, a session check, claims or what a paid plan unlocks.
- [Badges](docs/badges.md): the badge route, its styles and caching, and the static R2 badges.
  Read it before changing the badge route or the embed code, which third-party sites depend on.
- [Billing](docs/billing.md): plans, Stripe, webhooks and billing operations. Read it before
  changing prices, checkout, the portal or the webhook.
- [Operations](docs/operations.md): environments, secrets, deploys, D1 migrations, operator scripts
  and rollback. Read it before changing `wrangler.jsonc` or preparing anything remote.

## Commands

Run them from `apps/web/`. Inner loop, while editing:

- `pnpm exec vitest related --run <files>`: their tests (`*.dom.test.tsx` run in happy-dom).
- `pnpm dev`: `next dev` on local D1, after `pnpm db:migrate:local` and `pnpm db:seed:local`.
- `pnpm typecheck`: TypeScript, tests included, then the `.mjs` modules and scripts through
  `tsconfig.js.json` (`checkJs`, with implicit `any` allowed there until #98).

Finish gate, once per finished state: `pnpm check` (lint, typecheck, tests, `cf:audit`, the
OpenNext build and `docs:check`). It writes no source files; CI runs it on pull requests. Fix
formatting with `pnpm format`.

Evidence beyond the finish gate:

- **Worker entry, redirects, headers or `wrangler.jsonc`:** a run on `pnpm preview`.
- **Visible UI:** one local run with a screenshot at 1440 px and 390 px wide.

## Rules

- **Local values go in `.dev.vars`, never in `.env*` files.** The OpenNext build copies `.env*`
  values into the Worker bundle, and `scripts/check-bundle-env.mjs` fails the build if any are there.
- **Agents never deploy or run remote D1 commands** (`--remote`). The owner deploys with
  `pnpm deploy:staging` or `pnpm deploy:production`, never `wrangler deploy`, until
  [#100](https://github.com/serpcompany/dr.serp.co/issues/100) moves deploys to CI.
- **The top level of `wrangler.jsonc` is the local configuration,** and every remote command passes
  `--env`. Environments still inherit some top-level keys, such as `compatibility_date`, so read
  [Operations](docs/operations.md#environments) before changing it.
- **Every Ahrefs call costs API units.** A new call site keeps the guards in
  [DR lookups](docs/dr-lookups.md).
- **Scratch files go in `tmp/`**, which Git ignores, and are deleted when the task ends.

Agents never merge. The owner merges every pull request.

## Exceptions to the SERP standards

- **Email:** sign-in codes go through useSend from a no-reply sender on `mail.serp.co`, under the
  serp.co-subdomain directory exception in `standards/transactional-email.md`. That exception
  also needs a footer saying the address isn't monitored, with a link to the dashboard, which the
  code email lacks; #54 adds it.
- **URLs:** pages have no trailing slash, and the Worker strips one. Whether to adopt the SERP
  rule is [#51](https://github.com/serpcompany/dr.serp.co/issues/51); don't change slash
  behavior before it's decided.
- **Layout:** the map and `docs/` stay at the repository root rather than in `apps/web/`
  (`standards/web-stack/repository-layout.md`), because `apps/web` is the only surface (#42).
- **Rate limits** use a Durable Object (`RATE_LIMITER`), not D1.
- **Resource names:** Staging keeps `serp-dr-preview` (Worker and D1), Production `serp-dr` and
  `serp-dr-prod` (#43: new Workers would need every secret set again; D1 can't be renamed).
