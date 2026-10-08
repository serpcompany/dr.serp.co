import { beforeEach, describe, expect, it, vi } from 'vitest'

import { readJsonRecord } from '@/lib/read-json'

const fetchDomainRating = vi.fn()
const fetchDomainRatingHistory = vi.fn()
const getClaim = vi.fn()
const getDrChecks = vi.fn()
const recordDrCheck = vi.fn()
const recordDrHistoryChecks = vi.fn()
const upsertClaim = vi.fn()
const checkRateLimit = vi.fn()
const getRateLimitKey = vi.fn()
const resolveEntitlement = vi.fn()

vi.mock('@/server/db.mjs', () => ({
  getClaim,
  getDrChecks,
  recordDrCheck,
  recordDrHistoryChecks,
  upsertClaim
}))

vi.mock('@/server/entitlements.mjs', () => ({
  resolveEntitlement
}))

vi.mock('@/server/rate-limit.mjs', () => ({
  RATE_LIMITER_UNAVAILABLE_MESSAGE: 'This is unavailable right now. Please try again shortly.',
  checkRateLimit,
  getRateLimitKey
}))

vi.mock('@/server/dr-providers.mjs', async () => {
  const actual = await vi.importActual<typeof import('@/server/dr-providers.mjs')>(
    '@/server/dr-providers.mjs'
  )
  return {
    ...actual,
    fetchDomainRating,
    fetchDomainRatingHistory
  }
})

describe('POST /api/recheck', () => {
  beforeEach(() => {
    fetchDomainRating.mockReset()
    fetchDomainRatingHistory.mockReset()
    getClaim.mockReset()
    getDrChecks.mockReset()
    recordDrCheck.mockReset()
    recordDrHistoryChecks.mockReset()
    upsertClaim.mockReset()
    checkRateLimit.mockReset()
    getRateLimitKey.mockReset()
    resolveEntitlement.mockReset()
    getRateLimitKey.mockReturnValue('dr-recheck:127.0.0.1')
    checkRateLimit.mockResolvedValue({ allowed: true, remaining: 9, retryAfterMs: 60000 })
    getClaim.mockResolvedValue(null)
    getDrChecks.mockResolvedValue([])
    resolveEntitlement.mockResolvedValue(null)
    vi.useRealTimers()
  })

  it('rejects invalid domains before any provider call', async () => {
    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/recheck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({ domain: 'phpinfo.php' })
    })

    const response = await POST(request)
    const payload = await readJsonRecord(response)

    expect(response.status).toBe(400)
    expect(payload.error).toBe('Valid domain required')
    expect(fetchDomainRating).not.toHaveBeenCalled()
    expect(upsertClaim).not.toHaveBeenCalled()
    expect(recordDrCheck).not.toHaveBeenCalled()
    expect(fetchDomainRatingHistory).not.toHaveBeenCalled()
    expect(recordDrHistoryChecks).not.toHaveBeenCalled()
  })

  it('rate limits valid recheck requests before provider calls', async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterMs: 9000 })

    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/recheck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({ domain: 'example.com' })
    })

    const response = await POST(request)
    const payload = await readJsonRecord(response)

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('9')
    expect(payload.error).toBe('Too many recheck requests. Please try again shortly.')
    expect(getRateLimitKey).toHaveBeenCalledWith(request, 'dr-recheck')
    expect(fetchDomainRating).not.toHaveBeenCalled()
    expect(fetchDomainRatingHistory).not.toHaveBeenCalled()
  })

  it('refuses a domain with no stored DR without calling the provider', async () => {
    getClaim.mockResolvedValue({
      domain: 'example.com',
      domain_rating: null,
      updated_at: '2026-04-16T00:00:00.000Z'
    })

    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/recheck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({ domain: 'example.com' })
    })

    const response = await POST(request)
    const payload = await readJsonRecord(response)

    expect(response.status).toBe(404)
    expect(payload).toEqual({
      error: 'This site has no DR yet. Reload its page to look it up.',
      sitePath: '/sites/example.com'
    })
    expect(fetchDomainRating).not.toHaveBeenCalled()
    expect(upsertClaim).not.toHaveBeenCalled()
    expect(recordDrCheck).not.toHaveBeenCalled()
  })

  it('refuses a domain the site has never stored without calling the provider', async () => {
    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/recheck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({ domain: 'never-seen.example' })
    })

    const response = await POST(request)

    expect(response.status).toBe(404)
    expect(fetchDomainRating).not.toHaveBeenCalled()
  })

  it('rechecks a domain whose only stored DR is in its checks', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-20T00:00:00.000Z'))
    getDrChecks.mockResolvedValue([{ checked_at: '2026-05-01T00:00:00.000Z', domain_rating: 70 }])
    fetchDomainRating.mockResolvedValue({
      target: 'example.com',
      provider: 'ahrefs',
      domainRating: 71
    })
    upsertClaim.mockResolvedValue({ updated_at: '2026-06-20T00:00:00.000Z' })

    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/recheck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({ domain: 'example.com' })
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(fetchDomainRating).toHaveBeenCalledWith({ target: 'example.com' })
  })

  it('refuses a spam domain before the rate limit or any provider call', async () => {
    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/recheck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({ domain: 'best-casino-bonus.com' })
    })

    const response = await POST(request)
    const payload = await readJsonRecord(response)

    expect(response.status).toBe(404)
    expect(payload).toEqual({ error: 'Domain not found' })
    expect(checkRateLimit).not.toHaveBeenCalled()
    expect(getClaim).not.toHaveBeenCalled()
    expect(fetchDomainRating).not.toHaveBeenCalled()
  })

  it('refuses a domain whose stored title is spam without calling the provider', async () => {
    getClaim.mockResolvedValue({
      domain: 'example.com',
      domain_rating: 30,
      site_title: 'Situs Slot Gacor Terpercaya'
    })

    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/recheck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({ domain: 'example.com' })
    })

    const response = await POST(request)
    const payload = await readJsonRecord(response)

    expect(response.status).toBe(404)
    expect(payload).toEqual({ error: 'Domain not found' })
    expect(fetchDomainRating).not.toHaveBeenCalled()
    expect(upsertClaim).not.toHaveBeenCalled()
  })

  it('blocks free rechecks before the monthly cadence allows another provider call', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-20T00:00:00.000Z'))
    getDrChecks.mockResolvedValue([{ checked_at: '2026-06-01T00:00:00.000Z', domain_rating: 70 }])

    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/recheck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({ domain: 'example.com' })
    })

    const response = await POST(request)
    const payload = await readJsonRecord(response)

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe(String(11 * 24 * 60 * 60))
    expect(payload).toMatchObject({
      error: 'Free domains can be rechecked once every 30 days.',
      intervalDays: 30,
      tier: 'free',
      nextAllowedAt: '2026-07-01T00:00:00.000Z'
    })
    expect(fetchDomainRating).not.toHaveBeenCalled()
    expect(fetchDomainRatingHistory).not.toHaveBeenCalled()
  })

  it('blocks paid claimed domains before the weekly cadence allows another provider call', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-20T00:00:00.000Z'))
    getClaim.mockResolvedValue({ domain: 'example.com', email: 'paid@example.com' })
    getDrChecks.mockResolvedValue([{ checked_at: '2026-06-16T00:00:00.000Z', domain_rating: 70 }])
    resolveEntitlement.mockResolvedValue({ canAccessPaidFeatures: true })

    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/recheck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({ domain: 'example.com' })
    })

    const response = await POST(request)
    const payload = await readJsonRecord(response)

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe(String(3 * 24 * 60 * 60))
    expect(payload).toMatchObject({
      error: 'Paid domains can be rechecked once every 7 days.',
      intervalDays: 7,
      tier: 'paid',
      nextAllowedAt: '2026-06-23T00:00:00.000Z'
    })
    expect(resolveEntitlement).toHaveBeenCalledWith({ email: 'paid@example.com' })
    expect(fetchDomainRating).not.toHaveBeenCalled()
    expect(fetchDomainRatingHistory).not.toHaveBeenCalled()
  })

  it('records Ahrefs monthly history after a successful recheck of a claimed domain', async () => {
    getClaim.mockResolvedValue({
      domain: 'example.com',
      email: 'owner@example.com',
      domain_rating: 70
    })
    fetchDomainRating.mockResolvedValue({
      target: 'example.com',
      provider: 'ahrefs',
      domainRating: 72.9
    })
    upsertClaim.mockResolvedValue({
      updated_at: '2026-05-28T12:00:00.000Z'
    })
    recordDrCheck.mockResolvedValue({
      id: 1,
      domain: 'example.com',
      domain_rating: 72,
      provider: 'ahrefs',
      checked_at: '2026-05-28T12:00:00.000Z'
    })
    fetchDomainRatingHistory.mockResolvedValue({
      provider: 'ahrefs-history',
      target: 'example.com',
      points: [
        { checkedAt: '2024-05-28', domainRating: 61.2 },
        { checkedAt: '2024-06-28', domainRating: 62 }
      ]
    })
    recordDrHistoryChecks.mockResolvedValue([{ id: 2 }, { id: 3 }])

    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/recheck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({ domain: 'https://www.Example.com/path?q=1' })
    })

    const response = await POST(request)
    const payload = await readJsonRecord(response)

    expect(response.status).toBe(200)
    expect(fetchDomainRating).toHaveBeenCalledWith({ target: 'example.com' })
    expect(upsertClaim).toHaveBeenCalledWith({
      domain: 'example.com',
      domainRating: 72,
      provider: 'ahrefs'
    })
    expect(recordDrCheck).toHaveBeenCalledWith({
      domain: 'example.com',
      domainRating: 72,
      provider: 'ahrefs',
      checkedAt: new Date('2026-05-28T12:00:00.000Z')
    })
    expect(fetchDomainRatingHistory).toHaveBeenCalledWith({ target: 'example.com' })
    expect(recordDrHistoryChecks).toHaveBeenCalledWith({
      domain: 'example.com',
      provider: 'ahrefs-history',
      points: [
        { checkedAt: '2024-05-28', domainRating: 61.2 },
        { checkedAt: '2024-06-28', domainRating: 62 }
      ]
    })
    expect(payload).toEqual({
      ok: true,
      domain: 'example.com',
      domainRating: 72,
      provider: 'ahrefs',
      checkedAt: '2026-05-28T12:00:00.000Z',
      nextAllowedAt: '2026-06-27T12:00:00.000Z',
      intervalDays: 30,
      tier: 'free',
      historyPointCount: 2
    })
  })

  it("returns a fixed history warning and logs the provider's message when the import fails", async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('AHREFS_API_KEY', 'test-key')
    getClaim.mockResolvedValue({
      domain: 'example.com',
      email: 'owner@example.com',
      domain_rating: 70
    })
    fetchDomainRating.mockResolvedValue({
      target: 'example.com',
      provider: 'ahrefs',
      domainRating: 72
    })
    upsertClaim.mockResolvedValue({ updated_at: '2026-05-28T12:00:00.000Z' })
    const providerError = new Error('Set AHREFS_API_KEY to enable Ahrefs API')
    fetchDomainRatingHistory.mockRejectedValue(providerError)

    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/recheck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({ domain: 'example.com' })
    })

    const response = await POST(request)
    const payload = await readJsonRecord(response)
    vi.unstubAllEnvs()

    expect(response.status).toBe(200)
    expect(payload.historyWarning).toBe('History temporarily unavailable')
    expect(JSON.stringify(payload)).not.toContain('AHREFS_API_KEY')
    expect(consoleError).toHaveBeenCalledWith('recheck: DR history import failed', providerError)
  })

  it('skips the paid Ahrefs history import when rechecking an unclaimed domain', async () => {
    getClaim.mockResolvedValue({ domain: 'example.com', domain_rating: 70 })
    fetchDomainRating.mockResolvedValue({
      target: 'example.com',
      provider: 'ahrefs',
      domainRating: 72
    })
    upsertClaim.mockResolvedValue({
      updated_at: '2026-05-28T12:00:00.000Z'
    })

    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/recheck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({ domain: 'example.com' })
    })

    const response = await POST(request)
    const payload = await readJsonRecord(response)

    expect(response.status).toBe(200)
    expect(recordDrCheck).toHaveBeenCalled()
    expect(fetchDomainRatingHistory).not.toHaveBeenCalled()
    expect(recordDrHistoryChecks).not.toHaveBeenCalled()
    expect(payload).toMatchObject({ historyPointCount: 0 })
  })

  it('reports provider failures instead of returning the cached rating as a success', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    getClaim.mockResolvedValue({
      domain: 'example.com',
      domain_rating: 31,
      updated_at: '2026-07-03T00:00:00.000Z'
    })
    fetchDomainRating.mockRejectedValue(new Error('API units limit reached.'))

    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/recheck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({ domain: 'example.com' })
    })

    const response = await POST(request)
    const payload = await readJsonRecord(response)

    expect(response.status).toBe(503)
    expect(payload).toEqual({
      error: 'DR provider is unavailable right now. Please try again later.'
    })
    expect(upsertClaim).not.toHaveBeenCalled()
    expect(recordDrCheck).not.toHaveBeenCalled()
  })

  it('answers 503, not a cooldown, when the rate limiter is down', async () => {
    checkRateLimit.mockResolvedValue({
      allowed: false,
      unavailable: true,
      remaining: 0,
      retryAfterMs: 60000
    })

    const { POST } = await import('./route')
    const response = await POST(
      new Request('http://localhost/api/recheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
        body: JSON.stringify({ domain: 'example.com' })
      })
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBeNull()
    expect(await response.json()).toEqual({
      error: 'This is unavailable right now. Please try again shortly.'
    })
    expect(fetchDomainRating).not.toHaveBeenCalled()
  })
})
