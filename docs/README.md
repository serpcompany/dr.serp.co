# dr.serp.co Docs

What belongs in `docs/` and how to write it. For which doc covers what, start at
[AGENTS.md](../AGENTS.md).

## What belongs here

A doc holds what the code can't show: purpose, boundaries, invariants, the reasons behind a
decision, and gotchas. The code, its comments and its tests hold the how. Work still to do, and
the status of work, belong in GitHub issues, and the details of one change belong in its pull
request.

Update a doc when a boundary, an invariant, a term or an operating procedure changes, not on
every change in its area. Don't record per-deploy facts such as Worker version IDs: Cloudflare
keeps the deployment history.

## How to write

- Write for someone who knows the business but not the history of this code.
- One topic per doc. When a topic grows past its budget, split it, then link the new doc from
  `AGENTS.md`.
- No file-by-file inventories, env-variable tables or route lists that restate the code. Link to
  the file that holds them instead.
- Name files and folders under `docs/` in kebab-case. Only `README.md` and `AGENTS.md` are
  uppercase.
- Never put live credentials or secret values in a doc.

Maps (`AGENTS.md` and each `README.md`) stay within 120 lines, and every other doc within 300,
counted at 100 characters a line. `npm run docs:check` checks sizes, names and relative links, and
CI runs it on every pull request.

Material that no longer describes the code, kept only for reference, goes in `.archive/`. It never
overrides these docs or the code.
