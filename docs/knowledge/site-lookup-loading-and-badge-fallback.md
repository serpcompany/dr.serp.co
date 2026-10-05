# Site Lookup Loading And Badge Fallback

- The `/sites/[target]` page can take a while on first load because it may call the external DR provider before any cached claim/check exists.
- Keep a dedicated route-level loading UI in `src/app/sites/[target]/loading.tsx` with explicit copy that the lookup can take up to a minute.
- First-visit lookups are rate limited (`NEW_SITE_LOOKUP_*`, 10 per IP per hour, 100 per day). Over the limit, the page shows a "too many new site lookups" message instead of calling Ahrefs.
- `/api/recheck` returns 503 when the DR provider fails; it never reports the cached rating as a fresh recheck.
- There is no public Ahrefs proxy endpoint. All Ahrefs calls go through site lookups and rechecks, which are logged in `dr_checks`.
- Badge SVG rendering should fall back to `0`, not `??`, when the DR provider returns invalid data or the lookup fails. That keeps badge embeds deterministic and avoids odd public-facing output.
