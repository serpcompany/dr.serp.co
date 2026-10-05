# Auth Sessions And Claims

- Sign-in is email OTP. `POST /api/auth/request-otp` emails a 6-digit code and returns a signed token holding a keyed hash of the code (never the code itself).
- `POST /api/auth/verify-otp` checks the code against that token (10 guesses per email per 10 minutes, `VERIFY_OTP_RATE_LIMIT_*`) and sets a signed, HttpOnly, Secure, SameSite=Lax `dr_session` cookie valid for 30 days.
- Tokens are signed with `USESEND_OTP_SECRET` (falls back to `USESEND_API_KEY`). OTP and session tokens carry a `typ`, so one can't be replayed as the other. Sessions are stateless: rotating the secret is the only way to revoke them.
- Server routes take the email from the session cookie only (`getSessionEmail` in `src/server/auth-session.mjs`): claims, billing status, My Sites, Stripe portal and checkout. Any `email` in a request body is ignored.
- `dr-auth-email` in `localStorage` is display-only. The header syncs it with `GET /api/auth/session` on load.
- `setClaimEmail` never overwrites a claim held by another email; `/api/claims` returns 409 `claimed_by_other`.
- Claiming happens only from the add-site flow (`/sites/<domain>?claim=1`) or the "Claim this site" button. Site pages resolve ownership on the server, so owner emails are never sent to visitors.
- Before Oct 2026 none of this was enforced: the server trusted body emails and pages auto-claimed on view. That is how `bushe.co`, `archeomolise.it` and `pavilionhealthtoday.com` got claimed under `devin@serp.co`; the latter two were reverted.
