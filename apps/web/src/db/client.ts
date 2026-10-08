// A Drizzle client over a D1 binding. Queries in src/db take it as their first argument, so tests
// pass a local D1 directly; the site gets one per request from getDb() in src/db/index.ts.
import { DrizzleQueryError } from 'drizzle-orm'
import { type DrizzleD1Database, drizzle } from 'drizzle-orm/d1'

import * as schema from './schema'

export type Db = DrizzleD1Database<typeof schema>

export function dbFrom(d1: D1Database): Db {
  return drizzle(d1, { schema })
}

// Drizzle reports a failed D1 query as "Failed query: <sql>\nparams: <values>", keeping D1's own
// error only as its cause. Callers log error messages and the Stripe webhook stores them in
// dr_billing_audit, so that text would carry emails and Stripe IDs. Every exported query runs
// through this, which rethrows D1's error instead.
export function withDbErrors<A extends unknown[], R>(query: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R> => {
    try {
      return await query(...args)
    } catch (error) {
      if (error instanceof DrizzleQueryError && error.cause instanceof Error) throw error.cause
      throw error
    }
  }
}
