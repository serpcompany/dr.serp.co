import { signToken, verifyToken } from './signed-token.mjs'

export const SESSION_COOKIE_NAME = 'dr_session'
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: /** @type {const} */ ('lax'),
  path: '/',
  maxAge: SESSION_MAX_AGE_SECONDS
}

export function getAuthSecret() {
  return process.env.USESEND_OTP_SECRET || process.env.USESEND_API_KEY || null
}

/**
 * @param {string} email
 * @param {{ secret?: string | null, now?: number }} [options]
 */
export function createSessionToken(email, { secret = getAuthSecret(), now = Date.now() } = {}) {
  if (!secret) throw new Error('Missing USESEND_OTP_SECRET')
  return signToken({ typ: 'session', email, exp: now + SESSION_MAX_AGE_SECONDS * 1000 }, secret)
}

/**
 * @param {string | null | undefined} token
 * @param {{ secret?: string | null, now?: number }} [options]
 * @returns {string | null}
 */
export function verifySessionToken(token, { secret = getAuthSecret(), now = Date.now() } = {}) {
  if (!secret || !token) return null
  const result = verifyToken(token, secret, 'session', { now })
  return result.ok && typeof result.payload.email === 'string' ? result.payload.email : null
}

function readCookie(header, name) {
  for (const part of String(header ?? '').split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim()
  }
  return null
}

/**
 * Returns the signed-in email from the session cookie, or null. Never trust an email from the request body.
 * @param {{ headers: { get(name: string): string | null } }} request
 */
export function getSessionEmail(request) {
  return verifySessionToken(readCookie(request.headers.get('cookie'), SESSION_COOKIE_NAME))
}
