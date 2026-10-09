// The account area's writes, through the existing route handlers. Each answers a message the
// screen can show as is; route errors are fixed strings, never internal details.

export type ActionResult = { ok: true } | { ok: false; message: string }

async function send(path: string, method: 'POST' | 'DELETE', body: unknown): Promise<Response> {
  return fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

async function messageOf(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown }
    return typeof body.error === 'string' && body.error ? body.error : fallback
  } catch {
    return fallback
  }
}

async function act(
  path: string,
  method: 'POST' | 'DELETE',
  body: unknown,
  fallback: string
): Promise<ActionResult> {
  try {
    const response = await send(path, method, body)
    return response.ok ? { ok: true } : { ok: false, message: await messageOf(response, fallback) }
  } catch {
    return { ok: false, message: "Couldn't reach dr.serp.co. Check your connection and try again." }
  }
}

/** Looks the site's DR up again, within its recheck cadence. */
export function recheck(domain: string) {
  return act('/api/recheck', 'POST', { domain }, "Couldn't recheck this site. Try again later.")
}

/** Releases a claimed site: its page stays public and its link goes back to nofollow. */
export function release(domain: string) {
  return act('/api/claims', 'DELETE', { domain }, "Couldn't release this site. Try again.")
}

export type ClaimResult =
  | { ok: true }
  | { ok: false; kind: 'claimed-by-other' | 'upgrade' | 'failed'; message: string }

/** Claims a site for the signed-in account. */
export async function claim(domain: string): Promise<ClaimResult> {
  try {
    const response = await send('/api/claims', 'POST', { domain })
    if (response.ok) return { ok: true }
    const message = await messageOf(response, "Couldn't claim this site. Try again.")
    if (response.status === 409) return { ok: false, kind: 'claimed-by-other', message }
    if (response.status === 402) return { ok: false, kind: 'upgrade', message }
    return { ok: false, kind: 'failed', message }
  } catch {
    return {
      ok: false,
      kind: 'failed',
      message: "Couldn't reach dr.serp.co. Check your connection and try again."
    }
  }
}

export type Lookup = {
  domain: string
  dr: number | null
  title: string | null
  owner: 'you' | 'other' | 'nobody'
  /** Why no DR was looked up (a lookup cap), when dr is null. */
  note: string | null
}

export type LookupResult = { ok: true; site: Lookup } | { ok: false; message: string }

/** Looks a domain up for the add-site dialog (the same lookup and caps as its public page). */
export async function lookup(domain: string): Promise<LookupResult> {
  try {
    const response = await send('/api/sites/lookup', 'POST', { domain })
    if (!response.ok) {
      return { ok: false, message: await messageOf(response, "Couldn't look that site up.") }
    }
    return { ok: true, site: (await response.json()) as Lookup }
  } catch {
    return { ok: false, message: "Couldn't reach dr.serp.co. Check your connection and try again." }
  }
}
