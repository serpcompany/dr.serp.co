// A Drizzle client over a D1 binding. Queries in src/db take it as their first argument, so tests
// pass a local D1 directly; the site gets one per request from getDb() in src/db/index.ts.
import { type DrizzleD1Database, drizzle } from 'drizzle-orm/d1'

import * as schema from './schema'

export type Db = DrizzleD1Database<typeof schema>

export function dbFrom(d1: D1Database): Db {
  return drizzle(d1, { schema })
}
