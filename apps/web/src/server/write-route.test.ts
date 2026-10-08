import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { EMPTY_BODY, isTrustedOrigin, MAX_WRITE_BODY_BYTES, readWriteRequest } from './write-route'

const schema = z.object({ domain: z.string({ message: 'Valid domain required' }) })

function post(
  body: BodyInit | null,
  headers: Record<string, string> = {},
  url = 'https://dr.serp.co/api/claims'
) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://dr.serp.co', ...headers },
    body
  })
}

describe('readWriteRequest', () => {
  beforeEach(() => {
    vi.stubEnv('DR_PUBLIC_BASE_URL', 'https://dr.serp.co')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns the parsed body for a same-origin request', async () => {
    expect(await readWriteRequest(post(JSON.stringify({ domain: 'example.com' })), schema)).toEqual(
      {
        ok: true,
        data: { domain: 'example.com' }
      }
    )
  })

  it('refuses a foreign Origin with 403', async () => {
    const result = await readWriteRequest(post('{}', { Origin: 'https://evil.serp.co' }), schema)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(403)
      expect(await result.response.json()).toEqual({
        error: 'This request must come from dr.serp.co.'
      })
    }
  })

  it('refuses a request with no Origin', async () => {
    const request = new Request('https://dr.serp.co/api/claims', { method: 'POST', body: '{}' })
    const result = await readWriteRequest(request, EMPTY_BODY)
    expect(result.ok ? 200 : result.response.status).toBe(403)
  })

  it('accepts the origin the request was sent to, as on a local pnpm preview', () => {
    const request = post(
      '{}',
      { Origin: 'http://localhost:8787' },
      'http://localhost:8787/api/claims'
    )
    expect(isTrustedOrigin(request)).toBe(true)
  })

  it('refuses a body over the cap with 413, by Content-Length or by streamed size', async () => {
    const big = JSON.stringify({ domain: 'a'.repeat(MAX_WRITE_BODY_BYTES) })
    const declared = await readWriteRequest(post(big), schema)
    expect(declared.ok ? 200 : declared.response.status).toBe(413)

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(big))
        controller.close()
      }
    })
    const chunked = new Request('https://dr.serp.co/api/claims', {
      method: 'POST',
      headers: { Origin: 'https://dr.serp.co' },
      body: stream,
      // @ts-expect-error Node's fetch needs duplex for a stream body.
      duplex: 'half'
    })
    expect(chunked.headers.get('content-length')).toBeNull()
    const streamed = await readWriteRequest(chunked, schema)
    expect(streamed.ok ? 200 : streamed.response.status).toBe(413)
  })

  it("refuses invalid JSON and a body that doesn't match the schema with 400", async () => {
    const invalid = await readWriteRequest(post('{not json'), schema)
    expect(invalid.ok ? 200 : invalid.response.status).toBe(400)

    const wrongShape = await readWriteRequest(post(JSON.stringify({ domain: 42 })), schema)
    expect(wrongShape.ok).toBe(false)
    if (!wrongShape.ok) {
      expect(wrongShape.response.status).toBe(400)
      expect(await wrongShape.response.json()).toEqual({ error: 'Valid domain required' })
    }
  })

  it('reads a missing or empty body as {}', async () => {
    expect(await readWriteRequest(post(null), EMPTY_BODY)).toEqual({ ok: true, data: {} })
    expect(await readWriteRequest(post(''), EMPTY_BODY)).toEqual({ ok: true, data: {} })
  })
})
