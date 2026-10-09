// Better Auth's cookies are named `<prefix>.<name>`, with `__Secure-` in front over https.
export const AUTH_COOKIE_PREFIX = 'dr-serp'

const SESSION_COOKIE = new RegExp(
  `(?:^|;\\s*)(?:__Secure-)?${AUTH_COOKIE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.session_token=`
)

export function hasSessionCookie(cookieHeader: string | null | undefined): boolean {
  return SESSION_COOKIE.test(cookieHeader ?? '')
}
