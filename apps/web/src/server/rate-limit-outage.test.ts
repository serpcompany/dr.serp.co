import { afterEach, describe, expect, it, vi } from 'vitest'

const fetchStub = vi.hoisted(() => vi.fn())

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({
    env: { RATE_LIMITER: { idFromName: (name: string) => name, get: () => ({ fetch: fetchStub }) } }
  })
}))

describe('checkRateLimit when the Durable Object fails', () => {
  afterEach(() => {
    fetchStub.mockReset()
  })

  it("refuses, marks the result unavailable, and logs the limit without the key's IP or email", async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchStub.mockRejectedValue(new Error('Durable Object reset'))
    const { checkRateLimit } = await import('./rate-limit.mjs')

    const result = await checkRateLimit({
      key: 'otp-resend:user@example.com',
      points: 1,
      duration: 60
    })

    expect(result).toEqual({ allowed: false, unavailable: true, remaining: 0, retryAfterMs: 60000 })
    expect(consoleError).toHaveBeenCalledWith('rate-limit: limiter unavailable', {
      limit: 'otp-resend',
      error: 'Durable Object reset'
    })
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('user@example.com')
  })

  it('reports a refusal the Durable Object answers as a limit, not an outage', async () => {
    fetchStub.mockResolvedValue(Response.json({ allowed: false, remaining: 0, retryAfterMs: 5000 }))
    const { checkRateLimit } = await import('./rate-limit.mjs')

    expect(await checkRateLimit({ key: 'recheck:203.0.113.1', points: 10, duration: 60 })).toEqual({
      allowed: false,
      unavailable: false,
      remaining: 0,
      retryAfterMs: 5000
    })
  })

  it("treats an answer that isn't JSON as an outage", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchStub.mockResolvedValue(new Response('not json', { status: 200 }))
    const { checkRateLimit } = await import('./rate-limit.mjs')

    expect(
      await checkRateLimit({ key: 'recheck:203.0.113.1', points: 10, duration: 60 })
    ).toMatchObject({
      allowed: false,
      unavailable: true
    })
  })
})
