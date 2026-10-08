# Git workflow

This repo uses GitHub Flow, not classic GitFlow. There is no long-lived `develop`
branch, release branch, or hotfix branch family. `main` is the deployable branch.

## Current repo facts

- GitHub remote: `https://github.com/serpcompany/dr.serp.co.git`
- Default working branch: `main`
- Local `main` tracks `origin/main`
- Pull requests target `main`
- Current deployment target: Cloudflare Worker `serp-dr`
- Current deploy config source of truth: `wrangler.jsonc`
- No GitHub Actions workflow exists in this repo at the time this runbook was written.

## Branches

Use short-lived branches for normal work:

- `feat/<short-name>` for product features.
- `fix/<short-name>` for bug fixes.
- `chore/<short-name>` for maintenance.
- `docs/<short-name>` for docs-only work.
- `codex/<short-name>` for agent-led implementation branches.
- Dependabot branches are created by Dependabot and should still target `main`.

Delete task branches after merge when they are no longer needed.

## Normal change flow

1. Start from a clean working tree.

   ```sh
   git status --short --branch
   git fetch origin main
   git switch main
   git pull --ff-only
   ```

2. Create a short-lived branch.

   ```sh
   git switch -c fix/example-change
   ```

3. Make the change and run the smallest useful validation first.

4. Run the required gates before review:

   ```sh
   npm run test
   npm run cf:audit -- --strict --pretty
   npm run build
   ```

   For Cloudflare/runtime changes, also run:

   ```sh
   npm run cf:deploy:dry-run
   ```

5. Commit with a conventional commit message:

   ```sh
   git commit -m "fix(scope): describe the change"
   ```

6. Push the branch and open a pull request to `main`.

   ```sh
   git push -u origin fix/example-change
   ```

7. Merge after review and successful validation.

8. Pull the updated `main` locally.

   ```sh
   git switch main
   git pull --ff-only
   ```

## Direct main changes

Direct commits to `main` are allowed only for owner-approved operational work,
small cleanup after an already-approved migration, or emergency fixes where a
pull request would slow down recovery.

When committing directly to `main`:

- Confirm the newest user instruction authorizes it.
- Stage only the files that belong to the task.
- Do not stage local assistant files such as `.codex/` or `.claude/`.
- Run the same validation gates that would have been required for a pull request.
- Push `main` only after validation passes.

## Deployment flow

Cloudflare deploys are manual through Wrangler unless a CI workflow is added
later. Deploy only from an intended `main` commit or from an explicitly approved
operational commit.

Before deploy:

```sh
git status --short --branch
npm run test
npm run cf:audit -- --strict --pretty
npm run cf:deploy:dry-run
```

Deploy production:

```sh
npm run deploy:production
```

It builds for Production, fails if the bundle carries any `.env*` value
(`scripts/check-bundle-env.mjs`), then runs `opennextjs-cloudflare deploy`. Never use
`wrangler deploy` directly: it skips the pages OpenNext uploads.

After deploy:

- Confirm Wrangler reports `dr.serp.co (custom domain)`.
- Record the production Worker version in `docs/knowledge/cloudflare-operations.md`.
- Smoke-test production through Cloudflare:

  ```sh
  curl -I https://dr.serp.co/
  curl -sS 'https://dr.serp.co/api/sites?limit=1'
  curl -I https://dr.serp.co/badge/browserextensions.io
  ```

If local DNS is stale, use a current Cloudflare edge IP from:

```sh
dig @1.1.1.1 dr.serp.co A +short
```

Then run `curl --resolve 'dr.serp.co:443:<edge-ip>' ...`.

## Guardrails

- Do not commit secrets, `.dev.vars`, `.codex/`, `.claude/`, `.wrangler/`, `.open-next/`,
  `.next/`, or `tmp/` artifacts.
- Keep local values in `.dev.vars`, never in `.env*` files, which OpenNext copies into the
  Worker bundle.
- Do not run direct database commands without explicit approval in the current
  conversation.
- Keep Cloudflare bindings and Worker secrets in Cloudflare, not in Git.
- `wrangler.jsonc` is the deploy configuration source of truth.
- Update this runbook if GitHub Actions or another deploy authority is added.
