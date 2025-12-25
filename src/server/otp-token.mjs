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

export function createOtpToken({ email, code, expiresAt, secret }) {
  const payload = JSON.stringify({ email, code, exp: expiresAt })
  const payloadB64 = base64UrlEncode(payload)
  const signature = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64')
  const signatureB64 = signature.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${payloadB64}.${signatureB64}`
}

export function verifyOtpToken({ token, secret }) {
  if (!token || typeof token !== 'string') return { ok: false, error: 'Missing token' }
  const parts = token.split('.')
  if (parts.length !== 2) return { ok: false, error: 'Invalid token' }

  const [payloadB64, signatureB64] = parts
  const expected = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64')
  const expectedB64 = expected.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  if (!crypto.timingSafeEqual(Buffer.from(signatureB64), Buffer.from(expectedB64))) {
    return { ok: false, error: 'Invalid token' }
  }

  let payload
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64))
  } catch {
    return { ok: false, error: 'Invalid token' }
  }

  if (!payload?.email || !payload?.code || !payload?.exp) {
    return { ok: false, error: 'Invalid token' }
  }
  if (Date.now() > Number(payload.exp)) {
    return { ok: false, error: 'OTP expired' }
  }

  return { ok: true, payload }
}
