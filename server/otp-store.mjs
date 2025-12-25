const otpStore = globalThis.__otpStore || new Map()
globalThis.__otpStore = otpStore

const OTP_TTL_MS = 10 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000

export function createOtp(email) {
  const now = Date.now()
  const existing = otpStore.get(email)
  if (existing && now - existing.lastSentAt < RESEND_COOLDOWN_MS) {
    return { ok: false, retryAfterMs: RESEND_COOLDOWN_MS - (now - existing.lastSentAt) }
  }

  const code = String(Math.floor(100000 + Math.random() * 900000))
  otpStore.set(email, {
    code,
    expiresAt: now + OTP_TTL_MS,
    lastSentAt: now,
    attempts: 0,
  })
  return { ok: true, code, expiresAt: now + OTP_TTL_MS }
}

export function verifyOtp(email, code) {
  const entry = otpStore.get(email)
  if (!entry) return { ok: false, error: 'OTP not found' }
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(email)
    return { ok: false, error: 'OTP expired' }
  }

  entry.attempts += 1
  if (entry.attempts > 5) {
    otpStore.delete(email)
    return { ok: false, error: 'Too many attempts' }
  }

  if (entry.code !== code) {
    return { ok: false, error: 'Invalid code' }
  }

  otpStore.delete(email)
  return { ok: true }
}
