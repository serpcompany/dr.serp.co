import { describe, expect, it, vi } from 'vitest'

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(_state: unknown, _env: unknown) {}
  }
}))

class FakeStorage {
  values = new Map<string, any>()
  alarmAt: number | null = null

  async get(key: string) {
    return this.values.get(key)
  }

  async put(key: string, value: any) {
    this.values.set(key, value)
  }

  async delete(key: string) {
    this.values.delete(key)
  }

  async setAlarm(value: number) {
    this.alarmAt = value
  }
}

async function readJson(response: Response) {
  return response.json() as Promise<any>
}

async function createLimiter(storage = new FakeStorage()) {
  const { RateLimitDurableObject } = await import('./rate-limit-do.mjs')

  return new RateLimitDurableObject({ storage }, {})
}

describe('rate limiting', () => {
  it('derives a stable logical key from forwarded IP headers', async () => {
    const { getRateLimitKey } = await import('./rate-limit.mjs')
    const request = new Request('https://example.com', {
      headers: {
        'cf-connecting-ip': '203.0.113.99',
        'x-forwarded-for': '203.0.113.1, 198.51.100.2',
        'x-real-ip': '198.51.100.3'
      }
    })

    expect(getRateLimitKey(request, 'stripe-checkout')).toBe('stripe-checkout:203.0.113.99')
  })

  it('falls back to x-forwarded-for outside Cloudflare', async () => {
    const { getRateLimitKey } = await import('./rate-limit.mjs')
    const request = new Request('https://example.com', {
      headers: {
        'x-forwarded-for': '203.0.113.1, 198.51.100.2',
        'x-real-ip': '198.51.100.3'
      }
    })

    expect(getRateLimitKey(request, 'stripe-checkout')).toBe('stripe-checkout:203.0.113.1')
  })

  it('uses an in-memory fallback when no Durable Object binding is available', async () => {
    const { checkRateLimit } = await import('./rate-limit.mjs')
    const key = `fallback:${Date.now()}`

    await expect(checkRateLimit({ key, points: 2, duration: 60 })).resolves.toMatchObject({
      allowed: true,
      remaining: 1
    })
    await expect(checkRateLimit({ key, points: 2, duration: 60 })).resolves.toMatchObject({
      allowed: true,
      remaining: 0
    })
    await expect(checkRateLimit({ key, points: 2, duration: 60 })).resolves.toMatchObject({
      allowed: false,
      remaining: 0
    })
  })

  it('counts requests in a Durable Object fixed window', async () => {
    const storage = new FakeStorage()
    const limiter = await createLimiter(storage)
    const request = () =>
      new Request('https://rate-limit.local/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: 2, duration: 60 })
      })

    await expect(readJson(await limiter.fetch(request()))).resolves.toMatchObject({
      allowed: true,
      remaining: 1
    })
    await expect(readJson(await limiter.fetch(request()))).resolves.toMatchObject({
      allowed: true,
      remaining: 0
    })
    await expect(readJson(await limiter.fetch(request()))).resolves.toMatchObject({
      allowed: false,
      remaining: 0
    })
    expect(storage.alarmAt).toEqual(expect.any(Number))
  })

  it('clears the Durable Object bucket on alarm', async () => {
    const storage = new FakeStorage()
    const limiter = await createLimiter(storage)

    await storage.put('bucket', { points: 1, duration: 60, count: 1, resetAt: Date.now() + 60_000 })
    await limiter.alarm()

    await expect(storage.get('bucket')).resolves.toBeUndefined()
  })
})
