# Site Lookup Loading And Badge Fallback

- The `/sites/[target]` page can take a while on first load because it may call the external DR provider before any cached claim/check exists.
- Keep a dedicated route-level loading UI in `src/app/sites/[target]/loading.tsx` with explicit copy that the lookup can take up to a minute.
- Badge SVG rendering should fall back to `0`, not `??`, when the DR provider returns invalid data or the lookup fails. That keeps badge embeds deterministic and avoids odd public-facing output.
