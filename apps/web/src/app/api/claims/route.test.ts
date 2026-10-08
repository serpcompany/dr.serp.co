import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSessionToken } from '@/server/auth-session.mjs'

const getClaim = vi.fn()
const setClaimEmail = vi.fn()
const clearClaimEmail = vi.fn()
const resolveEntitlement = vi.fn()

vi.mock('@/db', () => ({
  getClaim,
  setClaimEmail,
  clearClaimEmail
}))

vi.mock('@/server/entitlements.mjs', () => ({
  resolveEntitlement
}))

function claimRequest(
  body: Record<string, unknown>,
  { email, method = 'POST' }: { email?: string; method?: string } = {}
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Origin: 'http://localhost'
  }
  if (email) headers.cookie = `dr_session=${createSessionToken(email, { secret: 'test-secret' })}`
  return new Request('http://localhost/api/claims', { method, headers, body: JSON.stringify(body) })
}

describe('/api/claims', () => {
  beforeEach(() => {
    vi.stubEnv('USESEND_OTP_SECRET', 'test-secret')
    getClaim.mockReset()
    setClaimEmail.mockReset()
    clearClaimEmail.mockReset()
    resolveEntitlement.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('requires a signed-in session instead of trusting the email in the body', async () => {
    const { POST } = await import('./route')
    const response = await POST(claimRequest({ email: 'devin@serp.co', domain: 'example.com' }))
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload).toMatchObject({ code: 'auth_required' })
    expect(getClaim).not.toHaveBeenCalled()
    expect(setClaimEmail).not.toHaveBeenCalled()
  })

  it('rejects forged session cookies', async () => {
    const { POST } = await import('./route')
    const forged = createSessionToken('devin@serp.co', { secret: 'wrong-secret' })
    const response = await POST(
      new Request('http://localhost/api/claims', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          cookie: `dr_session=${forged}`
        },
        body: JSON.stringify({ domain: 'example.com' })
      })
    )

    expect(response.status).toBe(401)
    expect(setClaimEmail).not.toHaveBeenCalled()
  })

  it('claims for the session email and ignores the email in the body', async () => {
    getClaim.mockResolvedValue(null)
    resolveEntitlement.mockResolvedValue({ canClaim: true })
    setClaimEmail.mockResolvedValue({ domain: 'example.com', email: 'user@example.com' })

    const { POST } = await import('./route')
    const response = await POST(
      claimRequest({ email: 'devin@serp.co', domain: 'example.com' }, { email: 'user@example.com' })
    )

    expect(response.status).toBe(200)
    expect(resolveEntitlement).toHaveBeenCalledWith({ email: 'user@example.com' })
    expect(setClaimEmail).toHaveBeenCalledWith({ domain: 'example.com', email: 'user@example.com' })
  })

  it('blocks claims when entitlement limit is exceeded', async () => {
    getClaim.mockResolvedValue(null)
    resolveEntitlement.mockResolvedValue({ canClaim: false, domainsLimit: 0, domainsUsed: 0 })

    const { POST } = await import('./route')
    const response = await POST(
      claimRequest({ domain: 'example.com' }, { email: 'user@example.com' })
    )
    const payload = await response.json()

    expect(response.status).toBe(402)
    expect(payload).toMatchObject({ code: 'upgrade_required' })
    expect(setClaimEmail).not.toHaveBeenCalled()
  })

  it('refuses to take over a domain claimed by another account', async () => {
    getClaim.mockResolvedValue({ domain: 'example.com', email: 'owner@example.com' })

    const { POST } = await import('./route')
    const response = await POST(
      claimRequest({ domain: 'example.com' }, { email: 'user@example.com' })
    )
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload).toMatchObject({ code: 'claimed_by_other' })
    expect(resolveEntitlement).not.toHaveBeenCalled()
    expect(setClaimEmail).not.toHaveBeenCalled()
  })

  it('reports a conflict when another account wins a concurrent claim', async () => {
    getClaim.mockResolvedValue(null)
    resolveEntitlement.mockResolvedValue({ canClaim: true })
    setClaimEmail.mockResolvedValue(null)

    const { POST } = await import('./route')
    const response = await POST(
      claimRequest({ domain: 'example.com' }, { email: 'user@example.com' })
    )

    expect(response.status).toBe(409)
  })

  it('rejects invalid domains before claiming', async () => {
    const { POST } = await import('./route')
    const response = await POST(
      claimRequest({ domain: 'ftp-config.json' }, { email: 'user@example.com' })
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toMatchObject({ error: 'Valid domain required' })
    expect(getClaim).not.toHaveBeenCalled()
    expect(resolveEntitlement).not.toHaveBeenCalled()
    expect(setClaimEmail).not.toHaveBeenCalled()
  })

  it('only unclaims for the session email', async () => {
    clearClaimEmail.mockResolvedValue(null)

    const { DELETE } = await import('./route')
    const unauthenticated = await DELETE(
      claimRequest({ email: 'owner@example.com', domain: 'example.com' }, { method: 'DELETE' })
    )
    expect(unauthenticated.status).toBe(401)
    expect(clearClaimEmail).not.toHaveBeenCalled()

    const response = await DELETE(
      claimRequest(
        { email: 'owner@example.com', domain: 'example.com' },
        { email: 'user@example.com', method: 'DELETE' }
      )
    )
    expect(response.status).toBe(200)
    expect(clearClaimEmail).toHaveBeenCalledWith({
      domain: 'example.com',
      email: 'user@example.com'
    })
  })
})
