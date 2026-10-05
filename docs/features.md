# Features

## Paid plan tiers (based on how many domains you want to monitor)

| Domains | Monthly | Annual (2 months free) |
| --- | --- | --- |
| 12 | $4 | $40 |
| 25 | $7 | $70 |
| 50 | $15 | $150 |
| 100 | $27 | $270 |

Notes:
- Annual pricing is billed yearly at 10× the monthly price.
- All paid tiers include the same features; only the domain limit changes.
- New claims are blocked once the domain limit is reached and the UI prompts for an upgrade.
- Free/public domain rechecks are limited to once every 30 days.

## Included with all paid tiers

- Monitor up to the tier domain limit
- Scheduled and on-demand DR updates up to once a week
- Email notifications
- Weekly recap email
- Backlinks & referring domains
- Milestones
- Set goals and track progress
- Leaderboard listing
- Domain directory listing
- Do-follow homepage link on `/sites/{page}`
- No ads

## Partner tracking

- Public `/sites/{page}` profiles give partners, directory listing customers, and link-building clients a shareable DR tracking page.
- The page shows the latest DR, historical DR chart, site metadata, homepage preview when available, and copyable badge embed.
- Signed-in users can return to tracked domains from "Your sites".
- Adding a site from the home page while signed in claims it. On a site page, signed-in users claim with "Claim this site"; viewing a page never claims it. A claimed site can't be taken over by another account.

## Public site pages

- Every public `/sites/{page}` profile attempts to resolve and store the site title and meta description.
- The first unresolved `/sites/{page}` visit uses Microlink to fetch normalized metadata and a screenshot.
- The first uncached DR scan of a claimed site imports Ahrefs Domain Rating history when `AHREFS_API_KEY` is configured. Unclaimed sites skip the history import to save API units.
- First-visit DR lookups are capped per IP and per day; spam and scanner-probe domains never get a lookup or a public page.
- Direct fetch parsing is used only as a fallback when Microlink fails.
- Resolved metadata is stored in the DB to avoid repeated third-party requests.
- A best-effort homepage screenshot is stored and displayed when Microlink returns one.
- Free listings open the homepage link in a new tab with `rel="nofollow noopener noreferrer"`.
- Paid claimed listings open the homepage link in a new tab without `nofollow`, making it a dofollow outbound link.

## Billing access

- Billing status is available at `/billing` after signing in.
- Stripe Customer Portal is available for self-serve plan changes and payment updates.

## Stripe setup

- Single product: "SERP DR Pro Subscription"
- Eight prices total: 4 monthly + 4 annual
