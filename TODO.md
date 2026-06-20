# TODO

- [x] move off vercel and onto cloudflare stack
  - Live traffic is served by Cloudflare Workers/OpenNext with D1. The repo no longer carries Vercel, Neon/Postgres, or Redis runtime dependencies.
- [x] we give to all 'partners', 'directory listing companies', 'people who want link build gigs', etc. so that they can visually track/see their DR going up from our efforts...
  - Public `/sites/{domain}` pages show the DR chart, embed badge, and site profile. Signed-in users can manage tracked sites from "Your sites".
- [x] for free accounts, run the DR check once a month max. paid accounts = once a week.
  - Public/free domains are limited to one recheck every 30 days. Claimed paid domains are limited to one recheck every 7 days.
- [x] on first scan can we import all ahrefs historical data? maybe we need to use one of those apify.com ahrefs checkers?
  - First uncached scans import Ahrefs Domain Rating history through the configured Ahrefs API when available.
