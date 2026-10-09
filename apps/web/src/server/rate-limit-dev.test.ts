// Under `next dev`, the RATE_LIMITER binding exists but can't run its Durable Object, so the
// limiter counts in memory there instead of answering every request as an outage.
import { afterEach, describe, expect, it, vi } from 'vitest'

const brokenBinding = vi.hoisted(() => ({
  idFromName: () => 'id',
  get: () => ({
    fetch: async () => {
      throw new Error('internal error; reference = abc')
    }
  })
}))

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: { RATE_LIMITER: brokenBinding } })
}))

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('rate limiting under next dev', () => {
  it('counts in memory when NODE_ENV is development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const { checkRateLimit } = await import('./rate-limit.mjs')
    const check = () => checkRateLimit({ key: 'dev-test', points: 1, duration: 60 })

    expect(await check()).toMatchObject({ allowed: true, unavailable: false })
    expect(await check()).toMatchObject({ allowed: false, unavailable: false })
  })

  it('still uses the binding, and reports its outage, outside development', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { checkRateLimit } = await import('./rate-limit.mjs')

    expect(await checkRateLimit({ key: 'prod-test', points: 1, duration: 60 })).toMatchObject({
      unavailable: true
    })
  })
})
