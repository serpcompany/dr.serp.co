# DR Lookups

How the site gets a domain's Domain Rating, what keeps it from spending Ahrefs API units on junk
or abuse, and which domains it refuses. Read this before adding any call to a DR provider.

## The provider

`fetchDomainRating` in `src/server/dr-providers.mjs` calls the Ahrefs API v3
(`site-explorer/domain-rating`) and throws when `AHREFS_API_KEY` isn't set.
`fetchDomainRatingHistory` calls `site-explorer/domain-rating-history`. Every Ahrefs call costs
API units.

The RhinoRank and EditorialLink scrapers are still in that file, but no caller passes the
`provider` argument that selects them, so they never run. FrogDR was removed in October 2026.
The scraping research is in `.archive/research/ahrefs-dr-without-api.md`.

## When Ahrefs is called

Ahrefs is called in three places, and every result is written to `dr_checks`:

1. **First visit to an unknown domain.** `/sites/<domain>` with no stored DR looks it up
   (`src/app/sites/[target]/site-snapshot.ts`). New lookups are capped at 10 per IP per hour and
   100 per day across the site (`NEW_SITE_LOOKUP_*`). Under the caps, the page fetches the site's
   metadata, skips the lookup when the title is spam, then calls Ahrefs. Over a cap, it says so
   and fetches and stores nothing. The page offers a recheck only once a DR is stored.
2. **A recheck.** `POST /api/recheck` only rechecks a domain with a stored DR, in `dr_claims` or
   `dr_checks`. It answers 404 for any other domain, with the `sitePath` whose first visit looks it
   up within the caps, and 404 for a spam domain or stored title. It allows 10 requests per IP per
   minute, and a domain can be rechecked once per 30 days, or once per 7 days when its owner has a
   paid plan (`src/server/recheck-cadence.mjs`), counted from its last check, or from the row's
   `updated_at` when it has none. When the provider fails, the route answers 503; it never reports
   the stored rating as a fresh one.
3. **History import.** A second paid call, made only for claimed domains: on a first lookup of a
   domain that is already claimed, and after each recheck. The add-site flow claims a domain after
   its first lookup, so its history arrives with its first recheck. The import is best effort; the
   current DR is enough to render.

A new call site must be rate-limited, must record its result in `dr_checks`, and must not run for
a domain that is invalid or spam.

The first lookup can take a while; `/sites/[target]/loading.tsx` shows a loading state meanwhile.
Provider errors can name internal env vars, so the site page, `/api/recheck` and the badge route
log them on the server and never return them. A failed history import during a recheck returns
the fixed `historyWarning` "History temporarily unavailable".

## Valid domains

`normalizeTarget()` in `src/server/domain-target.mjs` is the one source of truth for what counts
as a domain. Route handlers reject anything it refuses before any claim, recheck or lookup work
starts. It rejects:

- path-like input such as `phpinfo.php`, `wp-login.php`, `contact` or `pricing`;
- scanner probes: backup and config suffixes (`.save`, `.properties`, `.inc`, `.old`), the closed
  `.map` and `.prod` TLDs, a script extension before `.dev` or `.new` (`index.php.dev`), and bare
  config file names (`dockerfile.dev`, `outputs.tf`, `sendmail.cf`).

## Spam sites

`src/server/site-spam.mjs` matches the domain and the site title against gambling, escort,
darknet market, pharma and toto/togel patterns. Adult keywords are left out on purpose, so SERP's
own downloader sites aren't caught. A spam site:

- is hidden from the site list and its counts;
- renders not-found, with `noindex`;
- gets no first-visit lookup, whether its domain or its title matches, and no recheck.

The list and its counts also drop invalid and spam rows when reading, as a backstop for rows
stored before a rule existed.

## Cleaning up stored junk

Validation stops new junk but doesn't remove old rows. `POST /api/admin/sites/cleanup-invalid`
(with `x-admin-token`) dry-runs or purges them. By default it checks a fixed list of known junk
domains; with `scanAll: true` it scans every row for invalid domains and unclaimed spam sites.
Claimed rows are never purged by the spam rule. `npm run sites:purge-invalid` sends `scanAll`, and
only deletes with `-- --apply`, after the owner approves
([Operations](operations.md#operator-scripts)).

## Site metadata

`resolveSitePresentation` in `src/server/site-presentation.mjs` fetches a site's title,
description and a homepage screenshot from Microlink, and falls back to fetching the page's HTML.
It runs on a visit to a page whose title, description or URL is still missing, and stores the
result in `dr_claims`, so a site whose metadata resolves isn't fetched again. For a domain with no
stored DR it counts against the new-lookup caps, and it never runs for a stored spam title.
`npm run sites:backfill-metadata` fills in older rows.
