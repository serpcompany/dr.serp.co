/**
 * Where `/login` sends a visitor after signing in. Only a path on this site is accepted, so
 * `?callbackUrl=` can never redirect off-site; anything else, and `/login` itself, falls back to
 * the default. Ported from best.serp.co (accounts-and-sign-in.md § The sign-in screen).
 *
 * The value is resolved against the site's origin first and checked afterwards: the URL parser
 * resolves dot segments, so `/.//evil.example/` normalizes to `//evil.example/`, which a browser
 * reads as another host. Only the normalized path, query and fragment are returned.
 */

/** Where a sign-in with no (or no safe) callback lands. */
export const DEFAULT_CALLBACK_PATH = '/account'

/** Resolution base. Only same-origin results are kept, and only their path is returned. */
const SITE_ORIGIN = 'https://dr.serp.co'

export function safeCallbackPath(
  value: string | string[] | null | undefined,
  origin: string = SITE_ORIGIN
): string {
  const raw = Array.isArray(value) ? value[0] : value
  // Only root-relative paths; a backslash or control character is never part of one.
  if (!raw?.startsWith('/') || /[\\\p{Cc}]/u.test(raw)) return DEFAULT_CALLBACK_PATH
  let url: URL
  try {
    url = new URL(raw, origin)
  } catch {
    return DEFAULT_CALLBACK_PATH
  }
  if (url.origin !== new URL(origin).origin) return DEFAULT_CALLBACK_PATH
  const path = url.pathname
  // Checked after normalization: a path that now starts with `//` (or holds a backslash) is a
  // protocol-relative URL to another host.
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    return DEFAULT_CALLBACK_PATH
  }
  if (/^\/login(?:\/|$)/iu.test(path)) return DEFAULT_CALLBACK_PATH
  const result = `${path}${url.search}${url.hash}`
  // Belt and braces: the result must resolve to this origin on its own too.
  return new URL(result, origin).origin === new URL(origin).origin ? result : DEFAULT_CALLBACK_PATH
}

/** `/login?callbackUrl=<path>` for a sign-in link that comes back to `path`. */
export function loginHref(path: string): string {
  return path === DEFAULT_CALLBACK_PATH
    ? '/login'
    : `/login?callbackUrl=${encodeURIComponent(path)}`
}

/** How the signed-in screen names the destination. */
export function callbackDestination(path: string): { button: string; sentence: string } {
  if (/^\/account\/billing(?:[/?#]|$)/u.test(path)) {
    return { button: 'Continue to billing', sentence: 'Taking you to billing.' }
  }
  if (/^\/account(?:[/?#]|$)/u.test(path)) {
    return { button: 'Continue to your account', sentence: 'Taking you to your account.' }
  }
  return { button: 'Continue', sentence: 'Taking you back to the page you were on.' }
}
