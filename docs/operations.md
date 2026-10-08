# Operations

The environments, where secrets live, and how deploys, D1 migrations, operator scripts and rollback
work. Every remote operation here is the owner's: agents prepare and verify, but never deploy,
change secrets or run remote D1 commands. Moving deploys and migrations into CI is
[#100](https://github.com/serpcompany/dr.serp.co/issues/100).

## Environments

`wrangler.jsonc` defines three, and is the source of truth for names, IDs and bindings:

| Environment | Worker | D1 database | Host |
| --- | --- | --- | --- |
| Local (top level, never deployed) | `serp-dr-local` | `serp-dr-local` | `localhost` |
| Staging (`--env staging`) | `serp-dr-preview` | `serp-dr-preview` | `staging-dr.serp.co` |
| Production (`--env production`) | `serp-dr` | `serp-dr-prod` | `dr.serp.co` |

Both hosts are Worker custom domains on the `serp.co` zone; Wrangler creates the DNS record and
certificate on deploy. Staging keeps the `serp-dr-preview` names from before it was renamed
(AGENTS.md, Exceptions).

Each deployed environment also keeps its `*.serpcompany.workers.dev` host (`workers_dev: true`) so
CI can reach it, and has preview URLs off. `worker.ts` answers a `workers.dev` request with a 308
to the canonical host, unless it carries the `x-dr-serp-smoke-test` header (any value).

Named environments don't inherit the top level's bindings, vars or services, so each repeats
them. They do inherit other keys, including `main`, `compatibility_date`, `compatibility_flags`,
`assets`, `alias`, `upload_source_maps`, `observability` and the Durable Object `migrations`, so
changing one of those at the top level changes Staging and Production too.
`src/lib/wrangler-config.test.ts` resolves each environment the way Wrangler does and checks its
bindings, vars, hosts and flags. Every remote command passes `--env`; without it
Wrangler uses the local configuration.
`pnpm cf:audit --strict --pretty` fails when the top level points at a deployed Worker or
database. After changing bindings or vars, run `pnpm cf-typegen` to regenerate
`cloudflare-env.d.ts`.

## Secrets and local values

- **Deployed:** Worker secrets, set per environment by the owner:
  `pnpm exec wrangler secret put <NAME> --env <staging|production>`. `secrets.required` in
  `wrangler.jsonc` lists the ones the site needs.
- **Local:** `.dev.vars`, copied from `.dev.vars.example` and never committed. Never `.env*`: the
  OpenNext build copies those files into the Worker bundle, and `scripts/check-bundle-env.mjs`
  fails the build when it finds any.
- **Rotating `USESEND_OTP_SECRET`** signs everyone out ([Accounts and
  claims](accounts-and-claims.md)).

## Deploys

The owner deploys from a clean, intended commit on `main`, in `apps/web/`:

```sh
pnpm check
pnpm deploy:staging
pnpm deploy:production
```

Each `deploy:*` script builds for its environment, runs the bundle check, then runs
`opennextjs-cloudflare deploy --env <env>`. Never deploy with a bare `wrangler deploy`: in this
project Wrangler hands it to `opennextjs-cloudflare deploy`, but skips the build and the bundle
check, so it ships whatever build is sitting in `.open-next/`. `pnpm cf:deploy:dry-run` builds
and validates without deploying.

After a deploy, check that Wrangler reported the environment's custom domain, then run the smoke
test against it (or its `workers.dev` URL; the script sends the smoke-test header):

```sh
scripts/smoke.sh https://staging-dr.serp.co staging
scripts/smoke.sh https://dr.serp.co production
```

It checks the pages, a badge and `/api/sites`, the environment's robots header, the `workers.dev`
redirect to the canonical host, and that a write route refuses a request without `Origin`.

The Worker version belongs in the pull request or deploy notes, not in a doc. Cloudflare keeps
the history (`pnpm exec wrangler versions list --env production`).

## D1 migrations

The schema is `src/db/schema.ts`. A change to it becomes a migration with `pnpm db:generate`,
which writes SQL into `drizzle/` and updates Drizzle's journal; `pnpm db:check` (part of
`pnpm check`) fails when the two disagree. What Drizzle can't express, such as `STRICT` tables,
goes in a custom migration (`pnpm db:generate --custom`). Wrangler applies the files and records
each in the database's `d1_migrations` table. They are forward-only.

The baseline, `drizzle/0001_initial_d1_schema.sql`, keeps the name the Staging and Production
ledgers already record, so they never apply it again; later migrations get timestamp prefixes and
sort after it. `src/db/schema.test.ts` checks that a fresh migration builds exactly Production's
schema (`src/db/production-schema.json`) and that `schema.ts` describes it.

Apply locally first (`pnpm db:migrate:local`). The owner applies to Staging, checks the site
there, then applies to Production, until CI does it
([#100](https://github.com/serpcompany/dr.serp.co/issues/100)):

```sh
pnpm db:migrate:staging
pnpm db:migrate:production
```

Apply a migration before deploying code that depends on it. Data imports follow the same order,
Staging first, with `wrangler d1 execute ... --file`; keep their files in `tmp/` and delete them
afterwards. `pnpm db:migrations:list:<env>` shows what a database has applied.

## Operator scripts

These four call the admin API at `DR_ADMIN_BASE_URL`, or else at `DR_PUBLIC_BASE_URL`, when
`DR_ADMIN_TOKEN` is set. `.dev.vars.example` points `DR_PUBLIC_BASE_URL` at the local dev server,
so only setting `DR_ADMIN_BASE_URL` reaches a deployed Worker. Without a base URL or token they run
against the local fallback store. Neither local target proves anything about a deployed
environment:

- `pnpm sites:purge-invalid`: invalid and unclaimed spam domains ([DR lookups](dr-lookups.md)).
- `pnpm sites:backfill-metadata`: missing site titles, descriptions and screenshots.
- `pnpm billing:reconcile` and `pnpm billing:prune-audit`: see [Billing](billing.md).

The ones that change data only report until given `--apply`, which needs the owner's approval for
a deployed environment. Two more scripts:

- `pnpm webhook:health`: exits non-zero when Stripe webhooks are unhealthy.
- `pnpm r2:replace-badges`: the static R2 badges ([Badges](badges.md)).

`pnpm routes:manifest` lists the site's routes, and `pnpm routes:parity` compares two hosts'
responses (`BASE_A_URL`, `BASE_B_URL`), for example Production and Staging before a risky deploy.

## Rollback

- **Code:** `pnpm exec wrangler rollback <version-id> --env production` returns to a known-good version.
- **Routing:** if a deploy breaks the custom domain, detach or replace it only after confirming
  what traffic should fall back to.
- **Data:** D1 Time Travel restores a database to an earlier minute. Restore only with the owner's
  approval and a note of the incident and the target time.
