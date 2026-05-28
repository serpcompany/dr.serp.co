# Badges

This app supports two badge delivery paths: dynamic badges rendered by the app, and static badges hosted on R2.

## Dynamic Badges (Recommended)

Dynamic badges are rendered by the app route and replace the `__DR__` placeholder at request time.

- **Route:** `GET /badge/:domain`
- **Code:** [src/app/badge/[target]/route.ts](../src/app/badge/[target]/route.ts)
- **Templates:** `svgs/badges/verified-dr.svg`, `svgs/badges/serp-dr-v2.svg`
- **Style selection:** `?style=serp-dr-v3` (default), `?style=verified`, `?style=badge1` (alias), `?style=serp-dr-v2`
- **Optional override:** `?dr=NN` to force a number (useful for previews)

Example:

```
https://dr.serp.co/badge/example.com?style=serp-dr-v2
```

### How Other Projects Should Embed a Specific Design

Use the `style` query param on the `/badge/:domain` route. This is the recommended way for other projects to reference a specific badge design.

HTML example (serp-dr-v2):

```html
<a href="https://dr.serp.co/sites/example.com" target="_blank" rel="noopener noreferrer">
  <img
    src="https://dr.serp.co/badge/example.com?style=serp-dr-v2"
    alt="Verified DR 24 for example.com"
    width="200"
    height="50"
  />
</a>
```

Other styles:

- Serp DR v3 (default): `https://dr.serp.co/badge/example.com`
- Verified (explicit): `https://dr.serp.co/badge/example.com?style=verified`
- Verified (alias): `https://dr.serp.co/badge/example.com?style=badge1`

Preview override (no domain lookup):

```
https://dr.serp.co/badge/example.com?style=serp-dr-v2&dr=24
```

## Static Badges (R2)

R2 hosts static SVGs (e.g. `https://embeds.serp.co/serp-dr-small.svg`). These files are **not** dynamically updated.
If the SVG contains a number, that number is fixed in the file at upload time.

Production mapping:

- Worker: `badge-api`
- Worker binding: `BADGE_STORAGE` -> bucket `serp-embeds`
- Static key currently used: `serp-dr-small.svg`

To use static badges, set:

```env
DR_BADGE_BASE_URL=https://embeds.serp.co
```

If another project needs static R2 assets, it must use the exact R2 file URL. Those files are fixed and do not
support `style` or dynamic `__DR__` replacement.

### Safely Replacing Static R2 Badge Files

Use the built-in script to replace existing keys without breaking current embeds:

```bash
# 1) Dry-run (recommended first)
pnpm r2:replace-badges -- --bucket <your-r2-bucket>

# 2) Apply for real (backs up old objects first, then overwrites keys)
pnpm r2:replace-badges -- --bucket <your-r2-bucket> --apply
```

Current production bucket:

```bash
pnpm r2:replace-badges -- --bucket serp-embeds --apply
```

Defaults:

- Replacement map: `scripts/r2-badge-replacements.json`
- Current key mapping: `serp-dr-small.svg` -> `svgs/badges/verified-dr.svg`
- Backup prefix: `_backup/badges/<timestamp>/...` in the same bucket
- Local backup files: `tmp/r2-badge-backups/<timestamp>/...`

The script prints rollback commands after each run.

## Site Page Embed Behavior

On `/sites/:domain`, the badge preview is a custom HTML button rendered by [src/components/badges/badge-embed.tsx](../src/components/badges/badge-embed.tsx)
(not the actual SVG). The embed code uses the `badgeUrl` built in [src/app/sites/[target]/page.tsx](../src/app/sites/[target]/page.tsx):

- `DR_PUBLIC_BASE_URL` sets the public base used to build the `/sites/:domain` link target
- `DR_BADGE_BASE_URL` sets the `<img src>` used by the embed code

If you want the embed code to use dynamic badges, point `DR_BADGE_BASE_URL` at `DR_PUBLIC_BASE_URL`
and keep the generated `?style=serp-dr-v3` badge URL.

## Available Styles

| Style | URL |
|-------|-----|
| Serp DR v3 (default) | `https://dr.serp.co/badge/example.com` |
| Serp DR v3 (explicit) | `https://dr.serp.co/badge/example.com?style=serp-dr-v3` |
| Verified (explicit) | `https://dr.serp.co/badge/example.com?style=verified` |
| Badge1 (alias) | `https://dr.serp.co/badge/example.com?style=badge1` |
