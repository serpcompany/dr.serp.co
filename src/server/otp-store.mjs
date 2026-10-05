import crypto from 'node:crypto'

const otpStore = globalThis.__otpStore || new Map()
globalThis.__otpStore = otpStore

const RESEND_COOLDOWN_MS = 60 * 1000

export function createOtp(email) {
  const now = Date.now()
  const existing = otpStore.get(email)
  if (existing && now - existing.lastSentAt < RESEND_COOLDOWN_MS) {
    return { ok: false, retryAfterMs: RESEND_COOLDOWN_MS - (now - existing.lastSentAt) }
  }

  const code = String(crypto.randomInt(100000, 1000000))
  otpStore.set(email, { lastSentAt: now })
  return { ok: true, code, expiresAt: now + 10 * 60 * 1000 }
}
