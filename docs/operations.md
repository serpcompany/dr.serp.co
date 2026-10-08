# Operations

The environments, where secrets live, and how deploys, D1 migrations, operator scripts and rollback
work. Every remote operation here is the owner's: agents prepare and verify, but never deploy,
change secrets or run remote D1 commands. Moving deploys and migrations into CI is
[#44](https://github.com/serpcompany/dr.serp.co/issues/44).

## Environments

`wrangler.jsonc` defines three, and is the source of truth for names, IDs and bindings:

| Environment | Worker | D1 database | Host |
| --- | --- | --- | --- |
| Local (top level, never deployed) | `serp-dr-local` | `serp-dr-local` | `localhost` |
| Preview (`--env preview`) | `serp-dr-preview` | `serp-dr-preview` | `serp-dr-preview.serpcompany.workers.dev` |
| Production (`--env production`) | `serp-dr` | `serp-dr-prod` | `dr.serp.co`, a Worker custom domain on the `serp.co` zone |

Named environments don't inherit the top level's bindings, vars or services, so each repeats
them. They do inherit other keys, including `main`, `compatibility_date`, `compatibility_flags`,
`assets`, `observability` and the Durable Object `migrations`, so changing one of those at the top
level changes Preview and Production too. Every remote command passes `--env`; without it
Wrangler uses the local configuration.
`npm run cf:audit -- --strict --pretty` fails when the top level points at a deployed Worker or
database. After changing bindings or vars, run `npm run cf:types` to regenerate
`cloudflare-env.d.ts`.

## Secrets and local values

- **Deployed:** Worker secrets, set per environment by the owner:
  `npx wrangler secret put <NAME> --env <preview|production>`. `secrets.required` in
  `wrangler.jsonc` lists the ones the site needs.
- **Local:** `.dev.vars`, copied from `.dev.vars.example` and never committed. Never `.env*`: the
  OpenNext build copies those files into the Worker bundle, and `scripts/check-bundle-env.mjs`
  fails the build when it finds any.
- **Rotating `USESEND_OTP_SECRET`** signs everyone out ([Accounts and claims](accounts-and-claims.md)).

## Deploys

The owner deploys from a clean, intended commit on `main`:

```sh
npm test
npm run cf:audit -- --strict --pretty
npm run deploy:preview
npm run deploy:production
```

Each `deploy:*` script builds for its environment, runs the bundle check, then runs
`opennextjs-cloudflare deploy --env <env>`. Never use `wrangler deploy` directly: it skips the
build and the bundle check, and the cache upload OpenNext adds once an incremental cache is
configured. `npm run cf:deploy:dry-run` builds and validates without deploying.

After a deploy, check that Wrangler reported `dr.serp.co (custom domain)`, then smoke-test:

```sh
curl -I https://dr.serp.co/
curl -sS 'https://dr.serp.co/api/sites?limit=1'
curl -I https://dr.serp.co/badge/browserextensions.io
```

The Worker version belongs in the pull request or deploy notes, not in a doc. Cloudflare keeps
the history (`npx wrangler versions list --env production`).

## D1 migrations

Migrations are raw SQL in `migrations/`, applied by Wrangler, which records each in the database's
`d1_migrations` table. They are forward-only. Apply locally first:

```sh
npx wrangler d1 migrations apply SERP_DR_DB --local
```

The owner applies to Preview, checks the site there, then applies to Production:

```sh
npx wrangler d1 migrations apply SERP_DR_DB --env preview --remote
npx wrangler d1 migrations apply SERP_DR_DB --env production --remote
```

Apply a migration before deploying code that depends on it. Data imports follow the same order,
Preview first, with `wrangler d1 execute ... --file`; keep their files in `tmp/` and delete them
afterwards. Drizzle replaces raw SQL migrations in
[#48](https://github.com/serpcompany/dr.serp.co/issues/48).

## Operator scripts

These four call the deployed Worker's admin API when `DR_ADMIN_BASE_URL` (or
`DR_PUBLIC_BASE_URL`) and `DR_ADMIN_TOKEN` are set, and otherwise run against the local fallback
store, which proves nothing about a deployed environment:

- `npm run sites:purge-invalid`: invalid and unclaimed spam domains ([DR lookups](dr-lookups.md)).
- `npm run sites:backfill-metadata`: missing site titles, descriptions and screenshots.
- `npm run billing:reconcile` and `npm run billing:prune-audit`: see [Billing](billing.md).

The ones that change data only report until given `--apply`, which needs the owner's approval for
a deployed environment. Two more scripts:

- `npm run webhook:health`: exits non-zero when Stripe webhooks are unhealthy.
- `npm run r2:replace-badges`: the static R2 badges ([Badges](badges.md)).

`npm run routes:manifest` lists the site's routes, and `npm run routes:parity` compares two hosts'
responses (`BASE_A_URL`, `BASE_B_URL`), for example Production and Preview before a risky deploy.

## Rollback

- **Code:** `npx wrangler rollback <version-id> --env production` returns to a known-good version.
- **Routing:** if a deploy breaks the custom domain, detach or replace it only after confirming
  what traffic should fall back to.
- **Data:** D1 Time Travel restores a database to an earlier minute. Restore only with the owner's
  approval and a note of the incident and the target time.
