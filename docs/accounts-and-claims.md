# Accounts and Claims

How people sign in, how a session is trusted, and the rules for claiming a domain. Sign-in moves
to Better Auth in [#54](https://github.com/serpcompany/dr.serp.co/issues/54); until then, these
rules hold.

## Sign-in

Sign-in is a one-time code sent by email. There are no passwords.

1. `POST /api/auth/request-otp` emails a 6-digit code through useSend and returns a signed token
   that holds a keyed hash of the code, never the code itself. The same email can request a new
   code once a minute; that cooldown is kept in memory, so each Worker isolate has its own (#46).
2. `POST /api/auth/verify-otp` checks the code against the token, allowing 10 guesses per email
   per 10 minutes (`VERIFY_OTP_RATE_LIMIT_*`). On success it sets the `dr_session` cookie:
   HttpOnly, Secure, `SameSite=Lax`, valid for 30 days.

Tokens are signed with `USESEND_OTP_SECRET`, falling back to `USESEND_API_KEY` (`getAuthSecret`
in `src/server/auth-session.mjs`). Each token carries a `typ`, so a code token can't be replayed as a
session. Sessions are stateless: the only way to revoke them is to rotate the secret, which signs
everyone out. `DELETE /api/auth/session` signs one browser out.

## Trusting a session

- **Route handlers take the email only from the session cookie** (`getSessionEmail` in
  `src/server/auth-session.mjs`): claims, my sites, billing status, checkout and the portal. An
  `email` in a request body is ignored.
- **`dr-auth-email` in `localStorage` is for display only.** The header compares it with
  `GET /api/auth/session` on load and reloads once if they differ.
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
subscriptions are, and a lapsed one stays active until its current period ends. While it is:

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
