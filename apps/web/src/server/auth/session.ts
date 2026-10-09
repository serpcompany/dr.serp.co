// The signed-in email for a request, from its Better Auth session cookie, or null. Every route
// and page that needs "who is this" calls this; never trust an email from a request body.
import 'server-only'

import { hasSessionCookie } from './cookies'
import { getAuth } from './index'
import { scrubError } from './logging'

export async function getSessionEmail(request: { headers: Headers }): Promise<string | null> {
  // A request without a session cookie is anonymous: no auth instance, no D1 read.
  if (!hasSessionCookie(request.headers.get('cookie'))) return null
  const lookup = await getAuth()
  if (!lookup.ok) return null
  try {
    const session = await lookup.auth.api.getSession({ headers: request.headers })
    const user = session?.user
    return user?.emailVerified && user.email ? user.email.toLowerCase() : null
  } catch (error) {
    // Fail closed (no session), and keep the session token and email out of the log.
    console.error('auth: session lookup failed', scrubError(error))
    return null
  }
}
