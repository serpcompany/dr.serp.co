// Helpers for ON CONFLICT … DO UPDATE SET clauses.
import { type SQL, sql } from 'drizzle-orm'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'

// The value the conflicting insert tried to write.
export function excluded(column: AnySQLiteColumn): SQL {
  return sql`excluded.${sql.identifier(column.name)}`
}

// The inserted value, or the stored one when the insert left it NULL.
export function excludedOrStored(column: AnySQLiteColumn): SQL {
  return sql`COALESCE(${excluded(column)}, ${column})`
}
