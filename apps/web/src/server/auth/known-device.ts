// The known-device cookie (#135): set after a successful sign-in, it lets that browser request
// its account's next code under its own per-email budget, so someone flooding an email from many
// addresses can't lock its owner out.
//
// The value is `<payload>.<mac>`: a base64url JSON payload { u, iat, exp } (user id, issued and
// expiry times in seconds) and its HMAC-SHA256 under the KNOWN_DEVICE_KEY_LABEL key. It is
// HttpOnly, SameSite=Strict, scoped to /api/auth and lasts 180 days. It grants no session: it
// only changes which code limits apply, and only for the account whose id it carries.
import { base64url, fromBase64url } from './base64url'
import { readCookieValues } from './cookies'

export const KNOWN_DEVICE_COOKIE = 'dr_known_device'
export const KNOWN_DEVICE_MAX_AGE_SECONDS = 180 * 24 * 60 * 60
const COOKIE_PATH = '/api/auth'
const CLOCK_SKEW_SECONDS = 300
const MAX_TOKENS_CHECKED = 8

const encoder = new TextEncoder()

type Claims = { exp: number; iat: number; u: string }

export function knownDeviceCookieName(secure: boolean): string {
  return secure ? `__Secure-${KNOWN_DEVICE_COOKIE}` : KNOWN_DEVICE_COOKIE
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

/** A signed token for `userId`, issued at `now` and valid for 180 days. */
export async function issueKnownDevice(key: string, userId: string, now: Date): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000)
  const claims: Claims = { exp: iat + KNOWN_DEVICE_MAX_AGE_SECONDS, iat, u: userId }
  const payload = base64url(encoder.encode(JSON.stringify(claims)))
  const mac = await crypto.subtle.sign('HMAC', await macKey(key), encoder.encode(payload))
  return `${payload}.${base64url(new Uint8Array(mac))}`
}

/** True only for an untampered, unexpired token issued for `userId`. */
export async function verifyKnownDevice(key: string, token: string, userId: string, now: Date) {
  if (!token || token.length > 512) return false
  const [payload, mac, extra] = token.split('.')
  if (!payload || !mac || extra !== undefined) return false
  const signature = fromBase64url(mac)
  if (!signature) return false
  if (
    !(await crypto.subtle.verify('HMAC', await macKey(key), signature, encoder.encode(payload)))
  ) {
    return false
  }
  let claims: Partial<Claims>
  try {
    claims = JSON.parse(new TextDecoder().decode(fromBase64url(payload) ?? new Uint8Array()))
  } catch {
    return false
  }
  const seconds = Math.floor(now.getTime() / 1000)
  return (
    claims.u === userId &&
    typeof claims.exp === 'number' &&
    typeof claims.iat === 'number' &&
    claims.exp > seconds &&
    claims.iat <= seconds + CLOCK_SKEW_SECONDS
  )
}

/** True when any known-device token in the Cookie header verifies for `userId`. */
export async function anyKnownDevice(
  key: string,
  cookieHeader: string | null | undefined,
  secure: boolean,
  userId: string,
  now: Date
): Promise<boolean> {
  const tokens = readCookieValues(cookieHeader, knownDeviceCookieName(secure))
  for (const token of tokens.slice(0, MAX_TOKENS_CHECKED)) {
    if (await verifyKnownDevice(key, token, userId, now)) return true
  }
  return false
}

/** The Set-Cookie value that stores `token` for 180 days. */
export function knownDeviceSetCookie(token: string, secure: boolean): string {
  return [
    `${knownDeviceCookieName(secure)}=${token}`,
    `Max-Age=${KNOWN_DEVICE_MAX_AGE_SECONDS}`,
    `Path=${COOKIE_PATH}`,
    'HttpOnly',
    'SameSite=Strict',
    ...(secure ? ['Secure'] : [])
  ].join('; ')
}
