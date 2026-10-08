import { describe, expect, it } from 'vitest'

import { buildD1ImportSql, normalizeMigrationData } from './d1-migration-data.mjs'

describe('D1 migration data helpers', () => {
  it('normalizes booleans and dates for D1 strict tables', () => {
    const data = normalizeMigrationData({
      subscriptions: [
        {
          email: 'USER@Example.com',
          stripe_subscription_id: 'sub_1',
          cancel_at_period_end: false,
          created_at: '2026-06-20'
        }
      ],
      billingAudit: [
        {
          stripe_event_type: 'invoice.paid',
          success: 'false',
          cancel_at_period_end: 'true',
          created_at: '2026-06-20T00:00:00.000Z'
        }
      ]
    })

    expect(data.subscriptions[0]).toMatchObject({
      email: 'user@example.com',
      cancel_at_period_end: 0,
      created_at: '2026-06-20T00:00:00.000Z'
    })
    expect(data.billingAudit[0]).toMatchObject({
      success: 0,
      cancel_at_period_end: 1
    })
  })

  it('builds replace-import SQL and escapes string literals', () => {
    const { sql, summary } = buildD1ImportSql(
      {
        claims: [
          {
            domain: 'example.com',
            email: 'owner@example.com',
            site_title: "Owner's Site",
            claimed_at: '2026-06-20T00:00:00.000Z',
            updated_at: '2026-06-20T00:00:00.000Z'
          }
        ],
        checks: [
          { domain: 'example.com', domain_rating: 93, checked_at: '2026-06-20T00:00:00.000Z' }
        ]
      },
      { generatedAt: '2026-06-20T00:00:00.000Z' }
    )

    expect(summary).toEqual({ claims: 1, checks: 1, subscriptions: 0, billingAudit: 0 })
    expect(sql).toContain('Do not add explicit transaction statements')
    expect(sql).toContain('DELETE FROM dr_claims;')
    expect(sql).toContain("'Owner''s Site'")
    expect(sql).toContain('INSERT INTO dr_checks')
    expect(sql).not.toContain('BEGIN TRANSACTION;')
    expect(sql).not.toContain('COMMIT;')
  })

  it('drops incomplete rows before generating SQL', () => {
    const { summary, sql } = buildD1ImportSql({
      claims: [{ domain: '' }],
      checks: [{ domain: 'example.com', domain_rating: 'not-a-number' }],
      subscriptions: [{ email: 'user@example.com' }],
      billingAudit: [{ stripe_event_id: 'evt_1' }]
    })

    expect(summary).toEqual({ claims: 0, checks: 0, subscriptions: 0, billingAudit: 0 })
    expect(sql).not.toContain('INSERT INTO dr_claims')
    expect(sql).not.toContain('INSERT INTO dr_checks')
    expect(sql).not.toContain('INSERT INTO dr_subscriptions')
    expect(sql).not.toContain('INSERT INTO dr_billing_audit')
  })
})
