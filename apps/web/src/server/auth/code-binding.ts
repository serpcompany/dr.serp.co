// The code-binding cookie (#135): only the browser that requested an email's current code may
// guess it. Better Auth allows three guesses per code from anyone, so without this anyone could
// void a stranger's code by spending its guesses.
//
// Each code request answers with this cookie, `<exp>.<mac>`: the expiry in epoch seconds and an
// HMAC-SHA256 (under the CODE_BINDING_KEY_LABEL key) over the email, the stored hash of the code
// that request created, and the expiry. The stored hash is the per-send nonce: a newer request for
// the email, from anyone, replaces it, so a cookie matches only while its code is the latest.
//
// /sign-in/email-otp refuses a guess before Better Auth counts it unless one of the request's
// binding cookies matches the email's latest code, and answers exactly as for a wrong code. The
// cookie is HttpOnly, SameSite=Strict, scoped to /api/auth, and lasts the code's ten minutes plus
// five, so a late guess still hears that the code expired.
import { SIGN_IN_CODE_TTL_SECONDS } from '@/lib/sign-in-code'
import { base64url, fromBase64url } from './base64url'
import { readCookieValues } from './cookies'

export const CODE_BINDING_COOKIE = 'dr_code_binding'
export const CODE_BINDING_MAX_AGE_SECONDS = SIGN_IN_CODE_TTL_SECONDS + 5 * 60
const COOKIE_PATH = '/api/auth'
/** More same-named cookies than a browser plausibly holds are ignored past this many. */
const MAX_TOKENS_CHECKED = 8
const TOKEN_PATTERN = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/

const encoder = new TextEncoder()

/** The code a binding is for: the email as Better Auth keys it and the code's stored hash. */
export type BoundCode = { email: string; storedOtp: string }

export function codeBindingCookieName(secure: boolean): string {
  return secure ? `__Secure-${CODE_BINDING_COOKIE}` : CODE_BINDING_COOKIE
}

/**
 * How a code is stored (storeOTP.hash in config.ts): SHA-256, base64url without padding, the
 * same digest as Better Auth's built-in "hashed" mode. Owning it lets the code request bind its
 * cookie to the stored hash without reading the row back.
 */
export async function hashOtp(otp: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(otp))))
}

function macKey(key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

function message({ email, storedOtp }: BoundCode, exp: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(encoder.encode(`v1\0${email}\0${storedOtp}\0${exp}`))
}

function expiry(now: Date): number {
  return Math.floor(now.getTime() / 1000) + CODE_BINDING_MAX_AGE_SECONDS
}

/** A binding for `code`, issued at `now`. */
export async function issueCodeBinding(key: string, code: BoundCode, now: Date): Promise<string> {
  const exp = expiry(now)
  const mac = await crypto.subtle.sign('HMAC', await macKey(key), message(code, exp))
  return `${exp}.${base64url(new Uint8Array(mac))}`
}

/**
 * A value shaped like a binding that matches no code. A code request that sends nothing answers
 * with it (unless the browser holds a binding for the email's current code), so the response
 * looks the same as one that sent a code.
 */
export function decoyCodeBinding(now: Date): string {
  return `${expiry(now)}.${base64url(crypto.getRandomValues(new Uint8Array(32)))}`
}

/** True only for an untampered, unexpired binding for exactly `code`. */
export async function verifyCodeBinding(key: string, token: string, code: BoundCode, now: Date) {
  const match = TOKEN_PATTERN.exec(token)
  if (!match) return false
  const exp = Number(match[1])
  const seconds = Math.floor(now.getTime() / 1000)
  if (exp <= seconds || exp > seconds + CODE_BINDING_MAX_AGE_SECONDS + 300) return false
  const signature = fromBase64url(match[2] ?? '')
  if (!signature) return false
  return crypto.subtle.verify('HMAC', await macKey(key), signature, message(code, exp))
}

/** The first of `tokens` that binds `code`, or null. */
export async function findCodeBinding(
  key: string,
  tokens: readonly string[],
  code: BoundCode,
  now: Date
): Promise<string | null> {
  for (const token of tokens.slice(0, MAX_TOKENS_CHECKED)) {
    if (await verifyCodeBinding(key, token, code, now)) return token
  }
  return null
}

/** Every binding in a Cookie header (a sibling site can plant extra same-named cookies). */
export function readCodeBindingTokens(cookieHeader: string | null | undefined, secure: boolean) {
  return readCookieValues(cookieHeader, codeBindingCookieName(secure))
}

/** Cookie attributes for ctx.setCookie: HttpOnly, SameSite=Strict, /api/auth only. */
export function codeBindingCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    maxAge: CODE_BINDING_MAX_AGE_SECONDS,
    path: COOKIE_PATH,
    sameSite: 'strict',
    secure
  } as const
}

/** The Set-Cookie value that removes the binding (after its code signs in). */
export function clearCodeBindingSetCookie(secure: boolean): string {
  return [
    `${codeBindingCookieName(secure)}=`,
    'Max-Age=0',
    `Path=${COOKIE_PATH}`,
    'HttpOnly',
    ...(secure ? ['Secure'] : []),
    'SameSite=Strict'
  ].join('; ')
}
