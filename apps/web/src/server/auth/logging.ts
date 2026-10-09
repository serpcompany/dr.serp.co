// What auth may write to the log. Better Auth's queries run on a Drizzle client, and Drizzle
// reports a failed query as "Failed query: <sql>\nparams: <values>", which here would carry the
// email, the code's hash (6 digits hash back in milliseconds) or a session token. Everything auth
// logs passes through scrubError, which keeps D1's own error and drops the query and its values.
import { DrizzleQueryError } from 'drizzle-orm'

const FAILED_QUERY = /Failed query:[\s\S]*/

export function scrubText(text: string): string {
  return text.replace(FAILED_QUERY, '[query withheld]')
}

/** A loggable description of `error` that never includes query values or other arguments. */
export function scrubError(error: unknown): string {
  if (error instanceof DrizzleQueryError) return scrubError(error.cause ?? 'query failed')
  if (error instanceof Error) return `${error.name}: ${scrubText(error.message)}`
  if (typeof error === 'string') return scrubText(error)
  // Objects and other values can carry request data; only their type is logged.
  return `[${typeof error}]`
}

type Level = 'debug' | 'info' | 'warn' | 'error'

/** Better Auth's logger: warnings and errors only, scrubbed. */
export const authLogger = {
  level: 'warn' as const,
  log(level: Level, message: string, ...args: unknown[]) {
    const line = ['better-auth:', scrubText(message), ...args.map(scrubError)].join(' ')
    if (level === 'error') console.error(line)
    else console.warn(line)
  }
}
