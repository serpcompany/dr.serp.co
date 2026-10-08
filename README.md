# dr.serp.co

[dr.serp.co](https://dr.serp.co) shows any website's Ahrefs Domain Rating on a shareable page,
serves an embeddable DR badge, and sells subscriptions for claiming and tracking domains. It is a
Next.js app on Cloudflare Workers with D1.

```bash
cd apps/web
pnpm install
cp .dev.vars.example .dev.vars   # local values; never put them in .env* files
pnpm dev
```

[AGENTS.md](AGENTS.md) maps the code, the commands and the docs. The docs themselves are in
[docs/](docs/README.md).
