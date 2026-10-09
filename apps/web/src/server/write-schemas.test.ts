// The exact bodies the site's client components and operator scripts send must pass their
// route's schema; a refused one would break a real request.
import { describe, expect, it } from 'vitest'
import { EMPTY_BODY } from './write-route'
import {
  BackfillBody,
  CheckoutBody,
  CleanupBody,
  DomainBody,
  PruneAuditBody
} from './write-schemas'

const email = 'user@example.com'

const CLIENT_BODIES = [
  // src/app/sites/[target]/claim-client.tsx, recheck-button.tsx
  { name: 'claim and recheck', schema: DomainBody, body: { domain: 'example.com' } },
  // src/components/account/actions.ts: release, and the add-site lookup
  { name: 'unclaim', schema: DomainBody, body: { email, domain: 'example.com' } },
  // src/components/account/actions.ts, startCheckout (an email is ignored)
  { name: 'checkout', schema: CheckoutBody, body: { domains: 12, billing: 'monthly' } },
  {
    name: 'checkout, signed in',
    schema: CheckoutBody,
    body: { domains: 100, billing: 'annual', email }
  },
  // src/components/account/actions.ts, changePlan
  { name: 'change plan', schema: CheckoutBody, body: { domains: 25, billing: 'annual' } },
  // src/components/account/actions.ts, openPortal (sign-in and sign-out go to Better Auth)
  { name: 'portal', schema: EMPTY_BODY, body: { email } },
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
