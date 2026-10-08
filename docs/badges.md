# Badges

A badge is an SVG that shows a domain's DR, embedded on other people's sites with a link back to
the domain's page here. Because the badge URL is pasted into third-party HTML, its path and query
parameters are a public contract: changing them breaks live embeds.

## The badge route

`GET /badge/<domain>` (`src/app/badge/[target]/route.ts`) renders the badge from an inline SVG
template in `badge-templates.ts`.

- **Styles:** `?style=serp-dr-v3` (the default) and `?style=serp-dr-v2`. `verified` and `badge1`
  are aliases of `serp-dr-v3`, kept because existing embeds use them. An unknown style falls back
  to the default.
- **The number** is the stored DR from `dr_claims`, or else the latest row in `dr_checks`. The
  route never calls Ahrefs, so a badge can't spend API units ([DR lookups](dr-lookups.md)).
- **No DR yet** renders `?`, as does a database error, which is logged on the server and never
  returned.
- **`?dr=NN`** forces a number (clamped to 0–100) for previews, with no lookup.
- **Caching:** a badge with a known DR, or `?`, is sent with `Cache-Control: public`. Previews and
  errors are `no-store`.
- An invalid domain returns 400.

The `serp-dr-v3` template asks for the Inter font from Google Fonts, but an SVG shown through
`<img>` can't load external fonts, so browsers fall back to the template's other font families.

## The embed code

`/sites/<domain>` shows the embed code (`src/components/badges/badge-embed.tsx`). The snippet links
to `DR_PUBLIC_BASE_URL/sites/<domain>` and loads the image from
`DR_BADGE_BASE_URL/badge/<domain>?style=serp-dr-v3`. `DR_BADGE_BASE_URL` falls back to
`DR_PUBLIC_BASE_URL`, then to `https://dr.serp.co`; each environment in `wrangler.jsonc` sets both
to its own origin. The page shows the live badge from that URL, as a button that copies the code.

```html
<a href="https://dr.serp.co/sites/example.com" target="_blank" rel="noopener noreferrer"><img
  src="https://dr.serp.co/badge/example.com?style=serp-dr-v3" alt="Verified DR 24 for example.com"
  width="200" height="50"></a>
```

## Static badges on R2

Older embeds load fixed SVGs from R2, such as `https://embeds.serp.co/serp-dr-small.svg`. They
are served by a separate Worker, `badge-api`, from the `serp-embeds` bucket, not by this site, and
any number in them was fixed at upload. They don't support `style` or a live DR.

`npm run r2:replace-badges -- --bucket serp-embeds` replaces those files from `svgs/badges/`,
following the map in `scripts/r2-badge-replacements.json`. Without `--apply` it only reports what
it would do. With `--apply` it first backs up each object under `_backup/badges/<timestamp>/` in
the bucket and to `tmp/r2-badge-backups/`, then prints the commands to roll back. It writes to a
production bucket, so only the owner runs it with `--apply`.
