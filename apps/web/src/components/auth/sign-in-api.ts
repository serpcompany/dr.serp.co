/**
 * The browser side of email-code sign-in, ported from best.serp.co: calls the three `/api/auth`
 * endpoints and turns each answer into one UI outcome (docs/accounts-and-claims.md).
 *
 * A code request answers 200 whether or not a per-email limit stopped the email, so `sent`
 * only means "if the address is valid, a code is on its way". Only per-client limits answer
 * 429. Requests are same-origin, so the browser sends the cookies (including the code
 * binding) and the `Origin` Better Auth checks.
 */

import {
  SIGN_IN_CODE_ATTEMPTS,
  SIGN_IN_CODE_LENGTH,
  SIGN_IN_CODE_TTL_SECONDS,
  signInCodeDigits
} from '@/lib/sign-in-code'

/** The code contract Better Auth enforces (`src/lib/sign-in-code.ts`). */
export const CODE_LENGTH = SIGN_IN_CODE_LENGTH
export const CODE_LIFETIME_SECONDS = SIGN_IN_CODE_TTL_SECONDS
export const CODE_LIFETIME_MINUTES = Math.ceil(SIGN_IN_CODE_TTL_SECONDS / 60)
export const CODE_ATTEMPTS = SIGN_IN_CODE_ATTEMPTS
/**
 * The digits of a pasted, typed, or autofilled code ("482 913" → "482913"), the same
 * normalization Better Auth's sign-in hook applies.
 */
export const codeDigits = signInCodeDigits

/** What pasted, inserted, or autofilled text means for the code field (`readCodeText`). */
export type CodeText =
  /** Exactly one code: it replaces the slots and is sent at once. */
  | { code: string; kind: 'code' }
  /** A fragment of digits and separators only (" 482 "): its digits go in at the caret. */
  | { digits: string; kind: 'digits' }
  /** Ambiguous (two different codes, or six or more digits with no code): nothing changes. */
  | { kind: 'ignore' }

/**
 * A standalone code in text: six digits, optionally split 3+3 by one space, NBSP, thin space,
 * or dash ("Code: 719208", "482 913", "482-913"). No digit may touch it, directly or across one
 * such separator, so part of a phone number ("Call 555 123 4567") is not a code.
 */
const CODE_IN_TEXT =
  /(?<!\d[ \t\u00a0\u2009\u202f\-\u2013]?)\d{3}[ \t\u00a0\u2009\u202f\-\u2013]?\d{3}(?![ \t\u00a0\u2009\u202f\-\u2013]?\d)/gu
/** Text that is only a fragment of a code: digits, whitespace, and dashes. */
const CODE_FRAGMENT = /^[\d\s\-\u2013]*$/u

/**
 * Reads text headed for the code field. Text such as "It expires in 10 minutes. Code: 719208"
 * yields its one standalone code (719208), never its first six digits (107192), so pasting
 * from elsewhere cannot spend an attempt on a wrong guess. Two different codes, seven digits,
 * or six digits in another shape ("48 29 13") are ambiguous and change nothing: the safer
 * choice, since a guess the visitor did not mean costs one of three attempts. Invisible format
 * characters (zero-width spaces, BOM, soft hyphen) are dropped first.
 */
export function readCodeText(text: string): CodeText {
  const visible = text.replace(/\p{Cf}/gu, '')
  const codes = new Set([...visible.matchAll(CODE_IN_TEXT)].map(match => codeDigits(match[0])))
  if (codes.size === 1) return { code: [...codes][0] as string, kind: 'code' }
  if (codes.size > 1) return { kind: 'ignore' }
  const digits = codeDigits(visible)
  return digits.length < CODE_LENGTH && CODE_FRAGMENT.test(visible)
    ? { digits, kind: 'digits' }
    : { kind: 'ignore' }
}

/** One code a minute per email and client; the resend link waits this long. */
export const RESEND_COOLDOWN_SECONDS = 60

/**
 * `offline`: the request never reached the server. `unavailable`: the server answered 5xx (email,
 * the limiter, configuration or the database is down). `failed`: any other unexpected answer.
 */
export type CodeRequestOutcome =
  | { kind: 'sent' }
  | { kind: 'invalid-email' }
  | { kind: 'limited'; retryAfterSeconds: number }
  | { kind: 'unavailable' }
  | { kind: 'offline' }
  | { kind: 'failed' }

export type SignInOutcome =
  | { kind: 'signed-in'; email: string }
  | { kind: 'wrong' }
  | { kind: 'expired' }
  | { kind: 'attempts' }
  | { kind: 'limited'; retryAfterSeconds: number }
  | { kind: 'unavailable' }
  | { kind: 'offline' }
  | { kind: 'failed' }

type Fetch = typeof fetch

async function errorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { code?: unknown }
    return typeof body.code === 'string' ? body.code : ''
  } catch {
    return ''
  }
}

function retryAfter(response: Response): number {
  const seconds = Number(response.headers.get('retry-after'))
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 60
}

function post(fetcher: Fetch, path: string, body: unknown): Promise<Response> {
  return fetcher(`/api/auth${path}`, {
    body: JSON.stringify(body),
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    method: 'POST'
  })
}

export async function requestCode(
  email: string,
  fetcher: Fetch = fetch
): Promise<CodeRequestOutcome> {
  let response: Response
  try {
    response = await post(fetcher, '/email-otp/send-verification-otp', { email, type: 'sign-in' })
  } catch {
    return { kind: 'offline' }
  }
  if (response.ok) return { kind: 'sent' }
  if (response.status === 429) return { kind: 'limited', retryAfterSeconds: retryAfter(response) }
  if (response.status >= 500) return { kind: 'unavailable' }
  const code = await errorCode(response)
  if (response.status === 400 && code === 'INVALID_EMAIL') return { kind: 'invalid-email' }
  return { kind: 'failed' }
}

export async function verifyCode(
  email: string,
  otp: string,
  fetcher: Fetch = fetch
): Promise<SignInOutcome> {
  let response: Response
  try {
    response = await post(fetcher, '/sign-in/email-otp', { email, otp })
  } catch {
    return { kind: 'offline' }
  }
  if (response.ok) {
    try {
      const body = (await response.json()) as { user?: { email?: unknown } }
      return {
        email: typeof body.user?.email === 'string' ? body.user.email : email,
        kind: 'signed-in'
      }
    } catch {
      return { email, kind: 'signed-in' }
    }
  }
  if (response.status === 429) return { kind: 'limited', retryAfterSeconds: retryAfter(response) }
  if (response.status >= 500) return { kind: 'unavailable' }
  const code = await errorCode(response)
  if (code === 'OTP_EXPIRED') return { kind: 'expired' }
  if (code === 'TOO_MANY_ATTEMPTS') return { kind: 'attempts' }
  if (code === 'INVALID_OTP') return { kind: 'wrong' }
  return { kind: 'failed' }
}

/** The signed-in email other components show; the HttpOnly session cookie is the source of truth. */
export const DISPLAY_EMAIL_KEY = 'dr-auth-email'

/**
 * Ends the session and forgets the displayed email. Resolves true when the server confirmed it.
 * Better Auth refuses a POST without a JSON content type (415), even with no fields.
 */
export async function signOut(fetcher: Fetch = fetch): Promise<boolean> {
  try {
    window.localStorage.removeItem(DISPLAY_EMAIL_KEY)
  } catch {
    // Storage can be blocked; the server session still ends.
  }
  try {
    return (await post(fetcher, '/sign-out', {})).ok
  } catch {
    return false
  }
}

/** "45 seconds", "1 minute", "38 minutes", "1 hour". */
export function formatWait(seconds: number): string {
  if (seconds < 60) {
    const whole = Math.max(1, Math.ceil(seconds))
    return `${whole} ${whole === 1 ? 'second' : 'seconds'}`
  }
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
  const hours = Math.ceil(minutes / 60)
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
}

/** "0:42" for the resend countdown. */
export function formatCountdown(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}
