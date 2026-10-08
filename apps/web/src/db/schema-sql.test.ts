// schema.ts's index definitions and CHECK expressions match Production's. schema.test.ts compares
// column shapes and index names against the database; this compares the SQL Drizzle would write
// for schema.ts with production-schema.json, so a mistake in schema.ts can't flow into later
// generated migrations unnoticed.
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import { describe, expect, it } from 'vitest'

import production from './production-schema.json'
import * as schema from './schema'

// Lowercase, no quoting, no table qualifiers, single spaces, none around punctuation.
function normalize(sql: string) {
  return sql
    .toLowerCase()
    .replace(/;$/, '')
    .replace(/[`"]/g, '')
    .replace(/\bdr_\w+\.(?=\w)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),])\s*/g, '$1')
    .trim()
}

// The expression inside each CHECK (...), found by matching parentheses.
function checks(createTable: string) {
  const found: string[] = []
  const pattern = /check\s*\(/gi
  for (let match = pattern.exec(createTable); match; match = pattern.exec(createTable)) {
    let depth = 1
    let end = pattern.lastIndex
    while (depth > 0 && end < createTable.length) {
      if (createTable[end] === '(') depth += 1
      if (createTable[end] === ')') depth -= 1
      end += 1
    }
    found.push(normalize(createTable.slice(pattern.lastIndex, end - 1)))
  }
  return found.sort()
}

async function drizzleStatements() {
  const empty = await generateSQLiteDrizzleJson({})
  const current = await generateSQLiteDrizzleJson(schema)
  return (await generateSQLiteMigration(empty, current)).map(statement => statement.trim())
}

describe('schema.ts against Production SQL', () => {
  it('declares the same indexes, with their columns, order and WHERE', async () => {
    const statements = await drizzleStatements()
    const declared = statements.filter(sql => /^create (unique )?index/i.test(sql)).map(normalize)
    const live = production.objects
      .filter(object => object.type === 'index')
      .map(o => normalize(o.sql))

    expect(declared.sort()).toEqual(live.sort())
  })

  it('declares the same CHECK expressions on each table', async () => {
    const statements = await drizzleStatements()
    for (const table of production.objects.filter(object => object.type === 'table')) {
      const declared = statements.find(sql =>
        new RegExp(`^create table [\`"]?${table.name}[\`"]?\\s*\\(`, 'i').test(sql)
      )

      expect(declared, table.name).toBeDefined()
      expect(checks(declared ?? ''), table.name).toEqual(checks(table.sql))
    }
  })
})
