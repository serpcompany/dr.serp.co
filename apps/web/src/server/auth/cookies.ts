// Better Auth's cookies are named `<prefix>.<name>`, with `__Secure-` in front over https.
export const AUTH_COOKIE_PREFIX = 'dr-serp'

const SESSION_COOKIE = new RegExp(
  `(?:^|;\\s*)(?:__Secure-)?${AUTH_COOKIE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.session_token=`
)

export function hasSessionCookie(cookieHeader: string | null | undefined): boolean {
  return SESSION_COOKIE.test(cookieHeader ?? '')
}

/**
 * Every non-empty value of the cookie `name` in a Cookie header, in header order. A sibling
 * `*.serp.co` site can add a same-named cookie for a parent domain or a longer path, so callers
 * check each value rather than trusting the first.
 */
export function readCookieValues(cookieHeader: string | null | undefined, name: string): string[] {
  const values: string[] = []
  for (const part of (cookieHeader ?? '').split(';')) {
    const separator = part.indexOf('=')
    if (separator <= 0 || part.slice(0, separator).trim() !== name) continue
    const value = part.slice(separator + 1).trim()
    if (value) values.push(value)
  }
  return values
}
