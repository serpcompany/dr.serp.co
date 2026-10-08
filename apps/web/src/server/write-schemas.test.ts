// The exact bodies the site's client components and operator scripts send must pass their
// route's schema; a refused one would break a real request.
import { describe, expect, it } from 'vitest'
import { EMPTY_BODY } from './write-route'
import {
  BackfillBody,
  CheckoutBody,
  CleanupBody,
  DomainBody,
  MySitesBody,
  PruneAuditBody,
  RequestOtpBody,
  VerifyOtpBody
} from './write-schemas'

const email = 'user@example.com'

const CLIENT_BODIES = [
  // src/app/sites/[target]/claim-client.tsx, recheck-button.tsx
  { name: 'claim and recheck', schema: DomainBody, body: { domain: 'example.com' } },
  // src/app/_components/my-sites.tsx (unclaim, then the list)
  { name: 'unclaim', schema: DomainBody, body: { email, domain: 'example.com' } },
  { name: 'my sites', schema: MySitesBody, body: { email, query: '', limit: 12, offset: 0 } },
  // A long pasted search: the database layer truncates it, so the schema mustn't refuse it.
  {
    name: 'my sites, long search',
    schema: MySitesBody,
    body: { query: `https://example.com/?${'utm=x&'.repeat(80)}` }
  },
  // src/app/pricing/pricing-selector.tsx (email is dropped when undefined)
  { name: 'checkout', schema: CheckoutBody, body: { domains: 12, billing: 'monthly' } },
  {
    name: 'checkout, signed in',
    schema: CheckoutBody,
    body: { domains: 100, billing: 'annual', email }
  },
  // src/app/pricing/pricing-selector.tsx, for a subscriber
  { name: 'change plan', schema: CheckoutBody, body: { domains: 25, billing: 'annual' } },
  // billing-portal-button.tsx, billing-status-card.tsx, auth-status.tsx (sign-out sends no body)
  { name: 'portal and billing status', schema: EMPTY_BODY, body: { email } },
  { name: 'sign out', schema: EMPTY_BODY, body: {} },
  // src/app/_components/home.tsx
  { name: 'request a code', schema: RequestOtpBody, body: { email } },
  {
    name: 'verify a code',
    schema: VerifyOtpBody,
    body: { email, code: '482913', token: 'payload.signature' }
  },
  // scripts/prune-billing-audit.mjs, backfill-site-metadata.mjs, purge-invalid-site-domains.mjs
  { name: 'admin prune audit', schema: PruneAuditBody, body: { olderThanDays: 180, dryRun: true } },
  {
    name: 'admin backfill',
    schema: BackfillBody,
    body: { dryRun: false, limit: 25, offset: 0, query: '' }
  },
  { name: 'admin cleanup', schema: CleanupBody, body: { dryRun: true, scanAll: true } }
]

describe('write schemas', () => {
  for (const { name, schema, body } of CLIENT_BODIES) {
    it(`accepts the body the client sends: ${name}`, () => {
      expect(schema.safeParse(body).success).toBe(true)
    })
  }

  it("refuses a wrong type with the route's own message", () => {
    expect(DomainBody.safeParse({ domain: 42 }).error?.issues[0]?.message).toBe(
      'Valid domain required'
    )
    expect(
      CheckoutBody.safeParse({ domains: '12', billing: 'monthly' }).error?.issues[0]?.message
    ).toBe('Invalid domain tier.')
  })
})
