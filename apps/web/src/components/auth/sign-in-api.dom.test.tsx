// Ported from best.serp.co's sign-in-api tests; the review findings they cite are that repo's.
import { describe, expect, it, vi } from 'vitest'
import { signInCodeDigits } from '@/lib/sign-in-code'
import {
  OTP_ALLOWED_ATTEMPTS,
  OTP_EXPIRES_IN_SECONDS,
  OTP_LENGTH,
  otpEmailRules
} from '@/server/auth/config'
import {
  CODE_ATTEMPTS,
  CODE_LENGTH,
  CODE_LIFETIME_MINUTES,
  CODE_LIFETIME_SECONDS,
  codeDigits,
  DISPLAY_EMAIL_KEY,
  formatCountdown,
  formatWait,
  RESEND_COOLDOWN_SECONDS,
  readCodeText,
  requestCode,
  signOut,
  verifyCode
} from './sign-in-api'

// Owner bug: a code copied from the email as "482 913" did not paste into /login.
describe('signInCodeDigits', () => {
  it('keeps only the digits of a pasted, typed, or autofilled code', () => {
    for (const pasted of [
      '482913',
      '482 913',
      '482-913',
      ' 482913\n',
      '482\u00a0913',
      '482\u2009913',
      '\u200b482\u200c913\u200d\ufeff',
      '482\r\n913\t',
      '48–29—13'
    ]) {
      expect(signInCodeDigits(pasted), JSON.stringify(pasted)).toBe('482913')
    }
    expect(signInCodeDigits('')).toBe('')
    expect(signInCodeDigits('code: 12')).toBe('12')
    // The /login field uses exactly the normalization the server applies.
    expect(codeDigits).toBe(signInCodeDigits)
  })
})

// PR #82 review, finding 1: "It expires in 10 minutes. Code: 719208" must never send 107192.
describe('readCodeText', () => {
  it('finds the one standalone code in pasted text', () => {
    for (const text of [
      '719208',
      'It expires in 10 minutes. Code: 719208',
      'Your code: 719 208.',
      '719-208',
      '719\u00a0208',
      '719\u2009208',
      ' 719208\n',
      '\u200b719\u200b208\ufeff',
      '719208 is your SERP DR sign-in code',
      // The same code twice (subject and body) is still one code.
      '719208 is your SERP DR sign-in code\n\n    719208',
      'Call 555-1234 and enter 719208',
      'Enter this code:\n\n    719208\n\n\nIt expires in 10 minutes'
    ]) {
      expect(readCodeText(text), JSON.stringify(text)).toEqual({ code: '719208', kind: 'code' })
    }
  })

  it('changes nothing when the text is ambiguous', () => {
    for (const text of [
      'Old code 111 111, new code 719208',
      '719208 or 482913',
      '7192081',
      '719 2081',
      '1719208',
      '71 92 08',
      '719 - 208',
      '719\n208',
      'It expires in 10 minutes.',
      'Call 12345',
      'abc',
      // PR #82 review 2: part of a phone number is not a code.
      'Call 555 123 4567',
      '555-123-4567',
      '(555) 123-4567',
      '+1 555 123 4567',
      '4567 555 123',
      'Code 1 719208'
    ]) {
      expect(readCodeText(text), JSON.stringify(text)).toEqual({ kind: 'ignore' })
    }
  })

  it('passes a fragment of digits and separators to the caret', () => {
    expect(readCodeText(' 482 ')).toEqual({ digits: '482', kind: 'digits' })
    expect(readCodeText('48-29')).toEqual({ digits: '4829', kind: 'digits' })
    expect(readCodeText('5')).toEqual({ digits: '5', kind: 'digits' })
    expect(readCodeText('')).toEqual({ digits: '', kind: 'digits' })
  })
})

// PR #76 review, finding 6: the screen reads the code contract Better Auth is configured with.
describe('the code contract', () => {
  it('matches what Better Auth enforces', () => {
    expect(CODE_LENGTH).toBe(OTP_LENGTH)
    expect(CODE_LIFETIME_SECONDS).toBe(OTP_EXPIRES_IN_SECONDS)
    expect(CODE_LIFETIME_MINUTES).toBe(10)
    expect(CODE_ATTEMPTS).toBe(OTP_ALLOWED_ATTEMPTS)
    // Resend waits out the one-a-minute limit per email (and per email and client).
    for (const standing of ['new', 'member', 'known-device'] as const) {
      const minute = otpEmailRules(standing, 'a@b.co', '203.0.113.1').find(rule =>
        rule.name.endsWith('-minute')
      )
      expect(minute?.duration, standing).toBe(RESEND_COOLDOWN_SECONDS)
    }
  })
})

function answer(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return vi.fn(
    async () =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        headers: { 'content-type': 'application/json', ...headers },
        status
      })
  ) as unknown as typeof fetch & { mock: { calls: [string, RequestInit][] } }
}

describe('requesting a code', () => {
  it('posts the email as a sign-in code request from this origin', async () => {
    const fetcher = answer(200, { success: true })
    expect(await requestCode('owner@example.com', fetcher)).toEqual({ kind: 'sent' })
    const [url, init] = fetcher.mock.calls[0] ?? []
    expect(url).toBe('/api/auth/email-otp/send-verification-otp')
    expect(init).toMatchObject({ credentials: 'same-origin', method: 'POST' })
    expect(JSON.parse(String(init?.body))).toEqual({ email: 'owner@example.com', type: 'sign-in' })
  })

  it('maps each answer to one outcome', async () => {
    expect(
      await requestCode('a@b.co', answer(429, { code: 'RATE_LIMITED' }, { 'retry-after': '2280' }))
    ).toEqual({ kind: 'limited', retryAfterSeconds: 2280 })
    expect(await requestCode('a@b.co', answer(429, {}))).toEqual({
      kind: 'limited',
      retryAfterSeconds: 60
    })
    expect(await requestCode('a@b.co', answer(503, { code: 'OTP_DELIVERY_UNAVAILABLE' }))).toEqual({
      kind: 'unavailable'
    })
    expect(await requestCode('nope', answer(400, { code: 'INVALID_EMAIL' }))).toEqual({
      kind: 'invalid-email'
    })
    // Every server failure reads as unavailable, never as the visitor's connection.
    for (const [status, code] of [
      [503, 'RATE_LIMITER_UNAVAILABLE'],
      [503, 'AUTH_UNAVAILABLE'],
      [500, 'AUTH_FAILED'],
      [500, undefined]
    ] as const) {
      expect(await requestCode('a@b.co', answer(status, { code })), `${status} ${code}`).toEqual({
        kind: 'unavailable'
      })
    }
    expect(await requestCode('a@b.co', answer(403, { code: 'INVALID_ORIGIN' }))).toEqual({
      kind: 'failed'
    })
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    expect(await requestCode('a@b.co', offline)).toEqual({ kind: 'offline' })
  })
})

describe('verifying a code', () => {
  it('signs in and reports the account email', async () => {
    const fetcher = answer(200, { token: 't', user: { email: 'owner@example.com' } })
    expect(await verifyCode('Owner@Example.com', '482913', fetcher)).toEqual({
      email: 'owner@example.com',
      kind: 'signed-in'
    })
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      email: 'Owner@Example.com',
      otp: '482913'
    })
  })

  it('tells a wrong, expired, or used-up code apart', async () => {
    const outcome = (status: number, code: string) =>
      verifyCode('a@b.co', '000000', answer(status, { code, message: 'x' }))
    expect(await outcome(400, 'INVALID_OTP')).toEqual({ kind: 'wrong' })
    expect(await outcome(400, 'OTP_EXPIRED')).toEqual({ kind: 'expired' })
    expect(await outcome(403, 'TOO_MANY_ATTEMPTS')).toEqual({ kind: 'attempts' })
    expect(await verifyCode('a@b.co', '000000', answer(429, {}, { 'retry-after': '30' }))).toEqual({
      kind: 'limited',
      retryAfterSeconds: 30
    })
    expect(await outcome(403, 'INVALID_ORIGIN')).toEqual({ kind: 'failed' })
    expect(await outcome(503, 'RATE_LIMITER_UNAVAILABLE')).toEqual({ kind: 'unavailable' })
    expect(await outcome(500, 'AUTH_FAILED')).toEqual({ kind: 'unavailable' })
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    expect(await verifyCode('a@b.co', '000000', offline)).toEqual({ kind: 'offline' })
  })
})

describe('signing out', () => {
  it('posts JSON to sign-out, forgets the shown email, and reports whether it worked', async () => {
    window.localStorage.setItem(DISPLAY_EMAIL_KEY, 'owner@example.com')
    const fetcher = answer(200, { success: true })
    expect(await signOut(fetcher)).toBe(true)
    const [url, init] = fetcher.mock.calls[0] ?? []
    expect(url).toBe('/api/auth/sign-out')
    // Better Auth answers 415 to a POST without a JSON content type, leaving the session alive.
    expect(init).toMatchObject({ body: '{}', method: 'POST' })
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json')
    expect(window.localStorage.getItem(DISPLAY_EMAIL_KEY)).toBeNull()
    expect(await signOut(answer(403, {}))).toBe(false)
  })
})

describe('wait formatting', () => {
  it('says how long to wait in plain words', () => {
    expect(formatWait(1)).toBe('1 second')
    expect(formatWait(45)).toBe('45 seconds')
    expect(formatWait(60)).toBe('1 minute')
    expect(formatWait(2280)).toBe('38 minutes')
    expect(formatWait(3600)).toBe('1 hour')
    expect(formatCountdown(42)).toBe('0:42')
    expect(formatCountdown(60)).toBe('1:00')
    expect(formatCountdown(-3)).toBe('0:00')
  })
})
