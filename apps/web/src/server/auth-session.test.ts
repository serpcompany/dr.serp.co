import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSessionToken, getSessionEmail, verifySessionToken } from './auth-session.mjs'
import { createOtpToken, verifyOtpToken } from './otp-token.mjs'

function requestWithCookie(cookie: string) {
  return new Request('http://localhost/', { headers: { cookie } })
}

describe('session tokens', () => {
  beforeEach(() => {
    vi.stubEnv('USESEND_OTP_SECRET', 'test-secret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reads the signed-in email from the session cookie', () => {
    const token = createSessionToken('user@example.com')

    expect(getSessionEmail(requestWithCookie(`theme=dark; dr_session=${token}; other=1`))).toBe(
      'user@example.com'
    )
  })

  it('returns null without a cookie, with a tampered token, or after expiry', () => {
    const token = createSessionToken('user@example.com', { now: 0 })
    const [payload, signature] = createSessionToken('user@example.com').split('.')
    const tamperedPayload = Buffer.from(
      JSON.stringify({ typ: 'session', email: 'devin@serp.co', exp: Date.now() + 60000 })
    ).toString('base64url')

    expect(getSessionEmail(requestWithCookie(''))).toBeNull()
    expect(
      getSessionEmail(requestWithCookie(`dr_session=${tamperedPayload}.${signature}`))
    ).toBeNull()
    expect(getSessionEmail(requestWithCookie(`dr_session=${payload}.short`))).toBeNull()
    expect(verifySessionToken(token)).toBeNull()
  })

  it('never accepts an OTP token as a session', () => {
    const otpToken = createOtpToken({
      email: 'victim@example.com',
      code: '123456',
      expiresAt: Date.now() + 60000,
      secret: 'test-secret'
    })

    expect(getSessionEmail(requestWithCookie(`dr_session=${otpToken}`))).toBeNull()
  })
})

describe('OTP tokens', () => {
  const secret = 'test-secret'
  const expiresAt = Date.now() + 10 * 60 * 1000

  it('does not reveal the code to the browser', () => {
    const token = createOtpToken({ email: 'user@example.com', code: '482913', expiresAt, secret })
    const payload = Buffer.from(token.split('.')[0], 'base64url').toString('utf8')

    expect(payload).not.toContain('482913')
  })

  it('verifies only the matching email and code', () => {
    const token = createOtpToken({ email: 'user@example.com', code: '482913', expiresAt, secret })

    expect(verifyOtpToken({ token, email: 'user@example.com', code: '482913', secret }).ok).toBe(
      true
    )
    expect(verifyOtpToken({ token, email: 'user@example.com', code: '000000', secret })).toEqual({
      ok: false,
      error: 'Invalid code'
    })
    expect(verifyOtpToken({ token, email: 'other@example.com', code: '482913', secret })).toEqual({
      ok: false,
      error: 'Invalid code'
    })
  })

  it('never accepts a session token as an OTP token', () => {
    const sessionToken = createSessionToken('user@example.com', { secret })

    expect(
      verifyOtpToken({ token: sessionToken, email: 'user@example.com', code: '482913', secret }).ok
    ).toBe(false)
  })
})
