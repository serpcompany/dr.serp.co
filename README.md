# dr.serp.co

Next.js (App Router) app for generating a public Domain Rating (DR) page per domain and an embeddable badge.

## Routes

- `GET /sites/:domain` public page (DR + badge + embed snippet)
- `GET /badge/:domain` dynamic SVG badge (fallback / internal)
- `POST /api/auth/request-otp` send email OTP
- `POST /api/auth/verify-otp` verify OTP
- `GET /api/ahrefs/domain-rating?target=...` DR lookup API (best-effort via public checker pages)

## Local dev

1. `npm install`
2. `npm run dev`

## Environment variables

See `.env.example`. Key ones:

- `POSTGRES_URL` (Neon/Vercel Postgres)
- `USESEND_API_KEY` (UseSend)
- `USESEND_FROM` (e.g. `DR Checker <no-reply@mail.serp.co>`)
- `USESEND_OTP_SECRET` (optional; defaults to API key)
- `DR_PUBLIC_BASE_URL` (default: `https://dr.serp.co`)
- `DR_BADGE_BASE_URL` (default: `https://embeds.serp.co`)
