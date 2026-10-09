import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSessionToken } from '@/server/auth-session.mjs'

const countClaimsByEmail = vi.fn()
const listClaimsByEmail = vi.fn()
const resolveEntitlement = vi.fn()

vi.mock('@/db', () => ({
  countClaimsByEmail,
  listClaimsByEmail
}))

vi.mock('@/server/entitlements.mjs', () => ({
  resolveEntitlement
}))

function sessionCookie(email: string) {
  return `dr_session=${createSessionToken(email, { secret: 'test-secret' })}`
}

describe('POST /api/my-sites', () => {
  beforeEach(() => {
    vi.stubEnv('USESEND_OTP_SECRET', 'test-secret')
    countClaimsByEmail.mockReset()
    listClaimsByEmail.mockReset()
    resolveEntitlement.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('requires a signed-in session instead of trusting the email in the body', async () => {
    const { POST } = await import('./route')
    const response = await POST(
      new Request('http://localhost/api/my-sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
        body: JSON.stringify({ email: 'victim@example.com' })
      })
    )

    expect(response.status).toBe(401)
    expect(resolveEntitlement).not.toHaveBeenCalled()
    expect(listClaimsByEmail).not.toHaveBeenCalled()
  })

  it('returns an upgrade payload without an HTTP error for unpaid users', async () => {
    resolveEntitlement.mockResolvedValue({
      canAccessPaidFeatures: false,
      domainsLimit: 0,
      domainsUsed: 0
    })

    const { POST } = await import('./route')
    const response = await POST(
      new Request('http://localhost/api/my-sites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          cookie: sessionCookie('user@example.com')
        },
        body: JSON.stringify({})
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      ok: false,
      error: 'Upgrade required to manage monitored domains.',
      code: 'upgrade_required',
      entitlement: {
        canAccessPaidFeatures: false,
        domainsLimit: 0,
        domainsUsed: 0
      }
    })
    expect(countClaimsByEmail).not.toHaveBeenCalled()
    expect(listClaimsByEmail).not.toHaveBeenCalled()
  })

  it('lists claimed sites for paid users', async () => {
    resolveEntitlement.mockResolvedValue({ canAccessPaidFeatures: true })
    countClaimsByEmail.mockResolvedValue(1)
    listClaimsByEmail.mockResolvedValue([{ domain: 'example.com', domain_rating: 42 }])

    const { POST } = await import('./route')
    const response = await POST(
      new Request('http://localhost/api/my-sites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          cookie: sessionCookie('user@example.com')
        },
        body: JSON.stringify({
          email: 'someone-else@example.com',
          query: 'ex',
          limit: 12,
          offset: 0
        })
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(countClaimsByEmail).toHaveBeenCalledWith({ email: 'user@example.com', query: 'ex' })
    expect(listClaimsByEmail).toHaveBeenCalledWith({
      email: 'user@example.com',
      query: 'ex',
      limit: 12,
      offset: 0,
      sort: 'updated'
    })
    expect(payload).toEqual({
      ok: true,
      total: 1,
      sites: [{ domain: 'example.com', domain_rating: 42 }]
    })
  })
})
