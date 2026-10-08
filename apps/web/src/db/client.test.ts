// A failed D1 query surfaces as D1's own error, without Drizzle's SQL and bound values.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { getClaim } from './claims'
import { dbFrom } from './client'
import { upsertSubscription } from './subscriptions'

// A D1 binding whose every statement fails the way D1 reports a lock.
function failingD1() {
  const fail = async () => {
    throw new Error('D1_ERROR: database is locked: SQLITE_BUSY')
  }
  const statement = { bind: () => statement, all: fail, raw: fail, run: fail, first: fail }
  return { prepare: () => statement, batch: fail } as unknown as D1Database
}

describe('withDbErrors', () => {
  it("rethrows D1's error for reads and writes, so no email or ID reaches a log", async () => {
    const db = dbFrom(failingD1())

    await expect(getClaim(db, 'example.com')).rejects.toThrow(
      /^D1_ERROR: database is locked: SQLITE_BUSY$/
    )
    const write = upsertSubscription(db, {
      email: 'buyer@example.com',
      stripeSubscriptionId: 'sub_123',
      stripeCustomerId: 'cus_123'
    })
    await expect(write).rejects.toThrow('D1_ERROR: database is locked')
    await write.catch(error => {
      expect(String(error.message)).not.toMatch(
        /buyer@example\.com|sub_123|cus_123|params|Failed query/
      )
    })
  })

  it('wraps every exported query in the query modules', () => {
    const dir = path.join(__dirname)
    const modules = readdirSync(dir).filter(
      name =>
        name.endsWith('.ts') &&
        !name.endsWith('.test.ts') &&
        !/^(client|index|schema|values|listable|upsert|local-d1)\.ts$/.test(name)
    )

    expect(modules.sort()).toEqual([
      'billing-audit.ts',
      'checks.ts',
      'claims.ts',
      'sites.ts',
      'subscriptions.ts'
    ])
    for (const name of modules) {
      const unwrapped =
        readFileSync(path.join(dir, name), 'utf8').match(/^export (async )?function \w+/gm) ?? []
      expect(
        unwrapped.filter(line => !line.endsWith('billingAuditCutoff')),
        name
      ).toEqual([])
    }
  })
})
