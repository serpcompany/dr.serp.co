import { hmacBase64Url, safeEqual, signToken, verifyToken } from './signed-token.mjs'

function hashOtpCode({ email, code, secret }) {
  return hmacBase64Url(secret, `otp:${email}:${code}`)
}

// The token is returned to the browser, so it carries a keyed hash of the code, never the code itself.
export function createOtpToken({ email, code, expiresAt, secret }) {
  return signToken({ typ: 'otp', email, codeHash: hashOtpCode({ email, code, secret }), exp: expiresAt }, secret)
}

export function verifyOtpToken({ token, email, code, secret }) {
  const result = verifyToken(token, secret, 'otp')
  if (!result.ok) {
    return { ok: false, error: result.error === 'Token expired' ? 'OTP expired' : result.error }
  }

  const { payload } = result
  if (payload.email !== email || !safeEqual(payload.codeHash, hashOtpCode({ email, code, secret }))) {
    return { ok: false, error: 'Invalid code' }
  }

  return { ok: true, payload }
}
