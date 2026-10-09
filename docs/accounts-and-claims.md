# Accounts and Claims

How people sign in, how a session is trusted, and the rules for claiming a domain. Sign-in runs on
Better Auth ([#54](https://github.com/serpcompany/dr.serp.co/issues/54)); binding a code to the
browser that asked for it is #135, and the redesigned sign-in screen and email are #136.

## Sign-in

Sign-in is a one-time code sent by email. There are no passwords, and a first sign-in creates the
account. Better Auth (`src/server/auth/config.ts`) keeps users, sessions and codes in D1, in the
`users`, `sessions`, `accounts` and `verification` tables.

1. `POST /api/auth/email-otp/send-verification-otp` (`{ email, type: "sign-in" }`) emails a
   6-digit code through useSend (`src/server/auth/sender.ts`). The code lasts 10 minutes, is stored
   hashed and allows 3 guesses.
2. `POST /api/auth/sign-in/email-otp` (`{ email, otp }`) checks it. A code pasted as `482 913`
   counts as its digits. On success Better Auth sets its session cookie,
   `__Secure-dr-serp.session_token` (HttpOnly, Secure, `SameSite=Lax`, 30 days), backed by a row in
   `sessions`, so one session can be revoked without signing anyone else out.
3. `GET /api/auth/get-session` answers the session or `null`; `POST /api/auth/sign-out` ends it.

Every other Better Auth endpoint answers 404 before Better Auth sees it, and a test walks Better
Auth's router to prove it. Every POST needs an `Origin` among the trusted origins (403 otherwise,
cookie or not), and a body over 16 KB answers 413. Missing `BETTER_AUTH_SECRET` or
`BETTER_AUTH_URL` answers 503, and so does a code request when the site can't send email; only
`SITE_ENV=local` or `next dev` falls back to a throwaway secret. Neither the sign-in answer nor
`get-session` includes the session token, and errors are logged through `scrubError`
(`src/server/auth/logging.ts`), so no email, code hash or token reaches the logs.

**Limits** run on the `RATE_LIMITER` Durable Object, keyed by HMAC digests rather than raw emails
or IPs:

| What | Limit | Answer when hit |
| --- | --- | --- |
| Code requests per client (IP, or IPv6 /64) | 5 a minute, 20 an hour | 429 with `Retry-After` |
| Code requests per email | 1 a minute, 5 an hour | exactly like a sent code; nothing is sent |
| Code guesses per client | 10 a minute, 60 an hour | 429 with `Retry-After` |

No response reveals whether an email has an account.

Sessions from before Better Auth (the `dr_session` cookie) are not carried over: everyone signs in
once more. The old cookie is ignored and expires on its own.

## Trusting a session

- **Route handlers take the email only from the session** (`getSessionEmail` in
  `src/server/auth/session.ts`, which skips the lookup when there's no session cookie): claims, my
  sites, billing status, checkout and the portal. An `email` in a request body is ignored.
- **`dr-auth-email` in `localStorage` is for display only.** The header compares it with
  `GET /api/auth/get-session` on load and reloads once if they differ.
- **Site pages resolve ownership on the server,** so an owner's email is never sent to visitors.

Before October 2026 the server trusted emails in request bodies, and viewing a site page claimed
it. That is how several domains were claimed under the wrong account; the rules above prevent it,
and `src/app/api/claims/route.test.ts` covers them.

## Claiming a domain

A claim ties a domain to one account (`dr_claims.email`).

- **Claiming needs a paid plan with domains left on it.** `canClaim` in
  `src/server/entitlements.mjs` checks the plan's domain limit against the account's claims.
  Otherwise `POST /api/claims` answers 402 `upgrade_required`.
- **A claim is never taken over.** `setClaimEmail` refuses to replace another account's email,
  which also covers two claims racing, and the route answers 409 `claimed_by_other`.
- **Only an explicit action claims.** The add-site flow (`/sites/<domain>?claim=1`) or the "Claim
  this site" button; viewing a page never claims it. `DELETE /api/claims` releases a claim.
- **A claimed domain gets its DR history imported** from Ahrefs, whatever the owner's plan
  ([DR lookups](dr-lookups.md)).
- **No step proves the claimer controls the domain.** Whether to require a code sent to an address
  on the domain is [#52](https://github.com/serpcompany/dr.serp.co/issues/52).

## What a paid plan gives a claimed domain

`resolveEntitlement` decides whether the owner's plan is active: `active` and `trialing`
subscriptions on a dr.serp.co price are, and a lapsed one stays active until its current period
ends. A subscription on another SERP product's price is no plan here ([Billing](billing.md#webhooks)). While it is:

- the site page links to the domain's homepage without `nofollow`
  (`getOutboundLinkProps` in `src/app/sites/[target]/site-page-helpers.ts`);
- the domain can be rechecked every 7 days instead of every 30;
- the owner sees their domains under "Your sites" (`/api/my-sites`).

Two internal email addresses are hardcoded as unlimited accounts in `src/server/entitlements.mjs`.
An admin allowlist in D1 replaces them in #54.

## Admin access

Admin endpoints under `/api/admin/` accept a token only in the `x-admin-token` header, never the
query string, and compare it with `DR_ADMIN_TOKEN` in constant time (`src/server/admin-auth.mjs`).
There is no admin UI yet. [Billing](billing.md) and [DR lookups](dr-lookups.md) list what each
endpoint does; admin accounts and an `/admin` dashboard are #54.
