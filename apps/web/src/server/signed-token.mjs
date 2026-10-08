import crypto from 'node:crypto'

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function base64UrlDecode(input) {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4))
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/') + pad
  return Buffer.from(normalized, 'base64').toString('utf8')
}

export function hmacBase64Url(secret, value) {
  return base64UrlEncode(crypto.createHmac('sha256', secret).update(value).digest())
}

export function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ''))
  const right = Buffer.from(String(b ?? ''))
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

/**
 * Signs (does not encrypt) a payload. `typ` separates token kinds signed with the same secret,
 * so an OTP token can never be replayed as a session token.
 * @param {{ typ: string, exp: number } & Record<string, unknown>} payload
 * @param {string} secret
 */
export function signToken(payload, secret) {
  const payloadB64 = base64UrlEncode(JSON.stringify(payload))
  return `${payloadB64}.${hmacBase64Url(secret, payloadB64)}`
}

/**
 * @param {string} token
 * @param {string} secret
 * @param {string} typ
 * @param {{ now?: number }} [options]
 */
export function verifyToken(token, secret, typ, { now = Date.now() } = {}) {
  if (!token || typeof token !== 'string') return { ok: false, error: 'Missing token' }
  const parts = token.split('.')
  if (parts.length !== 2) return { ok: false, error: 'Invalid token' }

  const [payloadB64, signatureB64] = parts
  if (!safeEqual(signatureB64, hmacBase64Url(secret, payloadB64))) {
    return { ok: false, error: 'Invalid token' }
  }

  let payload
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64))
  } catch {
    return { ok: false, error: 'Invalid token' }
  }

  if (payload?.typ !== typ || !payload?.email || !payload?.exp) {
    return { ok: false, error: 'Invalid token' }
  }
  if (now > Number(payload.exp)) {
    return { ok: false, error: 'Token expired' }
  }

  return { ok: true, payload }
}
