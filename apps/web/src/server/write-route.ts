import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getPublicBaseUrl } from '@/lib/public-url'

// Every write route reads its request through readWriteRequest: a zod schema, a body cap and,
// for a route a browser calls, an Origin check. Every *.serp.co site is same-site to the others,
// so a SameSite=Lax session cookie alone doesn't stop a cross-site request. Admin routes, which
// operator scripts call with a token rather than a cookie, skip the Origin check.

/** The largest JSON body a write reads. Every route's body is a few hundred bytes. */
export const MAX_WRITE_BODY_BYTES = 16_000

/** A route with no body still checks its Origin; it accepts an empty or `{}` body. */
export const EMPTY_BODY = z.object({}).passthrough()

type Refusal = { ok: false; response: NextResponse }
export type WriteRequest<T> = { ok: true; data: T } | Refusal

function refuse(status: number, error: string): Refusal {
  return { ok: false, response: NextResponse.json({ error }, { status }) }
}

/**
 * True when the request's Origin is the site's canonical origin (`DR_PUBLIC_BASE_URL`) or the
 * origin the request was sent to, which covers a local `pnpm preview` on localhost. A request
 * with no Origin is refused: browsers send one with every POST and DELETE.
 */
export function isTrustedOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return false
  return origin === new URL(getPublicBaseUrl()).origin || origin === new URL(request.url).origin
}

type Body = { tooLarge: true } | { tooLarge: false; invalid: boolean; value?: unknown }

// Counts bytes as they stream in, so a chunked body with no Content-Length is cut off at the cap
// rather than buffered whole.
async function readBody(request: Request, maxBytes: number): Promise<Body> {
  if (Number(request.headers.get('content-length') || '0') > maxBytes) return { tooLarge: true }
  if (!request.body) return { tooLarge: false, invalid: false }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return { tooLarge: true }
      }
      chunks.push(value)
    }
  } catch {
    return { tooLarge: false, invalid: true }
  }

  const text = new TextDecoder().decode(Buffer.concat(chunks))
  if (!text.trim()) return { tooLarge: false, invalid: false }
  try {
    return { tooLarge: false, invalid: false, value: JSON.parse(text) as unknown }
  } catch {
    return { tooLarge: false, invalid: true }
  }
}

/**
 * Reads a write: 403 for an untrusted Origin (unless `checkOrigin` is false), 413 for a body over
 * `maxBytes`, 400 when
 * the body isn't JSON or doesn't match `schema` (with the first issue's message). A missing or
 * empty body is read as `{}`.
 */
export async function readWriteRequest<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
  {
    checkOrigin = true,
    maxBytes = MAX_WRITE_BODY_BYTES
  }: { checkOrigin?: boolean; maxBytes?: number } = {}
): Promise<WriteRequest<z.infer<S>>> {
  if (checkOrigin && !isTrustedOrigin(request))
    return refuse(403, 'This request must come from dr.serp.co.')

  const body = await readBody(request, maxBytes)
  if (body.tooLarge) return refuse(413, 'The request is too large.')
  if (body.invalid) return refuse(400, 'The request body must be JSON.')

  const parsed = schema.safeParse(body.value === undefined ? {} : body.value)
  if (!parsed.success) return refuse(400, parsed.error.issues[0]?.message ?? 'Invalid request.')
  return { ok: true, data: parsed.data }
}
