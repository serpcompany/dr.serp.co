# Accounts and Claims

How people sign in, how a session is trusted, and the rules for claiming a domain. Sign-in runs on
Better Auth ([#54](https://github.com/serpcompany/dr.serp.co/issues/54)). The screens follow the
mockups approved on [#140](https://github.com/serpcompany/dr.serp.co/issues/140).

## Sign-in

Sign-in is a one-time code sent by email. There are no passwords, and a first sign-in creates the
account. Better Auth (`src/server/auth/config.ts`) keeps users, sessions and codes in D1, in the
`users`, `sessions`, `accounts` and `verification` tables.

**The screen** is `/login` (`src/components/auth/login-card.tsx`): shadcn's login-03 email form,
then the code step as shadcn's InputOTP "Form" example (3 + 3 slots), then a signed-in screen that
returns to `?callbackUrl=`. `safeCallbackPath` (`src/lib/auth/callback-url.ts`) keeps that on the
site: same-origin only, checked after the URL parser resolves dot segments. Every answer has its
message: invalid email, the per-client 429 with its wait, any server failure (5xx: codes
unavailable, or the code not checked), a lost connection, any other answer ("Something went
wrong"), a wrong code with the tries left, an expired code and too many tries. Resend waits 60
seconds, and a refused resend holds it for the server's wait. Pastes, multi-character input and autofill go through one parser (`readCodeText` in
`src/components/auth/sign-in-api.ts`): one standalone code fills the slots and signs in, a
fragment of digits goes in at the caret, and anything ambiguous changes nothing. A rejected code
is never sent twice. The screen and its logic are ported from best.serp.co.

**The header** shows "Sign in" (to `/login`, back to the current page) or an account menu with the
account's pages and Sign out. Signing in ends with a full page load, so the header and the pages
that read the account start over signed in.

**The email** (`signInEmail` in `src/server/auth/sender.ts`) leaves the code out of the subject,
so it stays off lock screens, and shows it as one text node of bare digits spaced only by CSS
`letter-spacing`, so it copies as one word.

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

**A code works only in the browser that asked for it** (`src/server/auth/code-binding.ts`). Each
code request sets `dr_code_binding`: an HMAC over the email and the stored hash of that code
(HttpOnly, `SameSite=Strict`, `/api/auth` only, 15 minutes). A guess without the binding for the
email's latest code is refused before Better Auth counts it, with the same answer as a wrong code,
so nobody else can spend a code's 3 guesses. A newer request for the email, from anyone, replaces
the binding. A browser holds one binding, so asking for a code for a second email ends the first
email's code in that browser.

**A signed-in browser is remembered** (`src/server/auth/known-device.ts`): sign-in sets
`dr_known_device` for 180 days (signed, HttpOnly, `/api/auth` only). It grants no session; it only
gives that browser its own code budget for the account, so someone flooding the email from other
addresses can't lock the owner out. Every same-named cookie is checked, because a sibling
`*.serp.co` site could plant one.

**Limits** run on the `RATE_LIMITER` Durable Object, keyed by HMAC digests rather than raw emails
or IPs. The limits, the binding and Better Auth all use the email trimmed and lowercased, so a
padded address counts as the address itself. A client is its IPv4 address or IPv6 /64; `cf-connecting-ipv6` counts only behind a Class E
pseudo-IPv4 `cf-connecting-ip` (`src/server/auth/client-ip.ts`).

| What | Limit | Answer when hit |
| --- | --- | --- |
| Code requests per client | 5 a minute, 20 an hour | 429 with `Retry-After` |
| Codes for an email with no account | 1 a minute and 5 an hour per email; 300 an hour site-wide | like a sent code; nothing is sent |
| Codes for a member, from a browser it hasn't signed in on | 1 a minute and 5 an hour per email and client; 20 an hour per email | like a sent code |
| Codes for a member, from its known device | 1 a minute and 5 an hour per email and client; a separate 10 an hour | like a sent code |
| Code guesses per client | 10 a minute, 60 an hour | 429 with `Retry-After` |

No single response reveals whether an email has an account: a limited request still answers
success and sets a binding cookie (a decoy, or a fresh one for the code the browser already holds).
The code's length, lifetime and attempts are defined once in `src/lib/sign-in-code.ts`.

**Accepted risk: a determined prober can still tell.** Because a member's limits count per email
and client while a new email's count per email, a second request from another address is sent for
a member and held for a new email. Spending that request's guesses (a decoy never answers
`TOO_MANY_ATTEMPTS`), waiting past the code's 10 minutes (a decoy never answers `OTP_EXPIRED`) or
timing the answer (a sent code waits for useSend) then shows which it was. The probe costs two
addresses per email, mails the member a code each time and is held by the per-client limits;
best.serp.co, the reference, has the same design. Closing it would mean counting decoy guesses and
lifetimes on the Durable Object and delaying held answers to match a send. The SERP spec still
says no answer reveals an account; [serpcompany/serp#1447](https://github.com/serpcompany/serp/issues/1447)
decides between naming this risk there and closing the probe, which would change this site too.

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

## The account area

`/account` is the signed-in dashboard (`src/app/account/`), built on shadcn's dashboard-01 to the
mockups approved on #140: an inset sidebar (Add site, Overview, Sites, Billing, the three highest
DR sites, Pricing, the user menu), no public header or footer, and every page noindex and never
cached. `src/server/account.ts` loads it per request from D1: the plan, every claimed site with its
latest DR, its change against a reading at least 30 days older, a year of readings, and the weekly
average DR of the claimed sites. Signed out, `/account/*` redirects to `/login` and back.

- **Overview** (`/account`): counter cards (claimed sites, average DR, rising this month, plan),
  the average-DR chart, and the sites table; with no plan and no sites, a "Claim your sites with a
  plan" card instead.
- **Sites** (`/account/sites`): the data table (tabs All, Rising and Falling; recheck, copy badge
  code, public page and release per row). A site opens in a side panel with its DR history, a
  recheck, the badge and its link status; `?site=<domain>` opens it directly.
- **Add a site** (`?add=1`, the sidebar's Add site, the public header): looks the domain up
  through `POST /api/sites/lookup` (the site page's own loader and caps, signed in only), then
  claims it with `POST /api/claims`, or says who owns it or that the plan is full.
- `/add`, the old signed-in page, redirects to `/account/sites?add=1` (308). Billing and Settings
  move in with #143.

## Claiming a domain

A claim ties a domain to one account (`dr_claims.email`).

- **Claiming needs a paid plan with domains left on it.** `canClaim` in
  `src/server/entitlements.mjs` checks the plan's domain limit against the account's claims.
  Otherwise `POST /api/claims` answers 402 `upgrade_required`.
- **A claim is never taken over.** `setClaimEmail` refuses to replace another account's email,
  which also covers two claims racing, and the route answers 409 `claimed_by_other`.
- **Only an explicit action claims.** The account's Add site dialog, `/sites/<domain>?claim=1`, or
  the "Claim this site" button; viewing a page never claims it. `DELETE /api/claims` releases a
  claim.
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
- the owner sees their domains under Sites (`/account/sites`).

Two internal email addresses are hardcoded as unlimited accounts in `src/server/entitlements.mjs`.
An admin allowlist in D1 replaces them in #54.

## Admin access

Admin endpoints under `/api/admin/` accept a token only in the `x-admin-token` header, never the
query string, and compare it with `DR_ADMIN_TOKEN` in constant time (`src/server/admin-auth.mjs`).
There is no admin UI yet. [Billing](billing.md) and [DR lookups](dr-lookups.md) list what each
endpoint does; admin accounts and an `/admin` dashboard are #54.
