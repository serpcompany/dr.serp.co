// The migrations in drizzle/ build exactly Production's schema, and src/db/schema.ts describes
// the database they build: every column, its type, nullability and default, and every index.
import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type LocalD1, openMigratedLocalD1 } from './local-d1'
import production from './production-schema.json'
import {
  accounts,
  drBillingAudit,
  drChecks,
  drClaims,
  drSubscriptions,
  sessions,
  users,
  verification
} from './schema'

const TABLES: SQLiteTable[] = [
  drClaims,
  drChecks,
  drSubscriptions,
  drBillingAudit,
  users,
  sessions,
  accounts,
  verification
]

let d1: LocalD1
let dispose: () => Promise<void>

beforeAll(async () => {
  ;({ d1, dispose } = await openMigratedLocalD1())
}, 60_000)

afterAll(async () => {
  await dispose?.()
})

type MasterRow = { type: string; name: string; sql: string }
type ColumnRow = {
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

describe('D1 schema', () => {
  it("matches Production's sqlite_master exactly", async () => {
    const { results } = await d1
      .prepare(
        `SELECT type, name, sql FROM sqlite_master
         WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'
         ORDER BY type DESC, name`
      )
      .all<MasterRow>()

    expect(results).toEqual(production.objects)
  })

  for (const table of TABLES) {
    const config = getTableConfig(table)

    it(`schema.ts describes ${config.name}'s columns`, async () => {
      const { results } = await d1.prepare(`PRAGMA table_info(${config.name})`).all<ColumnRow>()

      expect(
        config.columns.map(column => ({
          name: column.name,
          type: column.getSQLType().toUpperCase(),
          notNull: column.notNull || column.primary,
          // Drizzle counts an autoincrement primary key as defaulted; SQLite doesn't.
          hasDefault: column.hasDefault && !column.primary
        }))
      ).toEqual(
        results.map(row => ({
          name: row.name,
          type: row.type,
          notNull: row.notnull === 1 || row.pk === 1,
          hasDefault: row.dflt_value !== null
        }))
      )
    })

    it(`schema.ts names ${config.name}'s indexes`, async () => {
      const { results } = await d1
        .prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ?`)
        .bind(config.name)
        .all<{ name: string; sql: string | null }>()
      const declared = config.indexes.map(index => ({
        name: index.config.name,
        unique: index.config.unique
      }))

      expect(declared.sort((a, b) => a.name.localeCompare(b.name))).toEqual(
        results
          .filter(row => row.sql !== null)
          .map(row => ({ name: row.name, unique: row.sql?.startsWith('CREATE UNIQUE') ?? false }))
          .sort((a, b) => a.name.localeCompare(b.name))
      )
    })
  }
})
