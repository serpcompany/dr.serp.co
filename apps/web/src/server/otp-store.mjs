import crypto from 'node:crypto'

import { checkRateLimit } from './rate-limit.mjs'

const RESEND_COOLDOWN_SECONDS = 60
const CODE_TTL_MS = 10 * 60 * 1000

// One code per email per minute. The cooldown is counted in the RATE_LIMITER Durable Object, so
// every Worker isolate shares it; when the Durable Object fails, checkRateLimit refuses.
export async function createOtp(email) {
  const rate = await checkRateLimit({
    key: `otp-resend:${email}`,
    points: 1,
    duration: RESEND_COOLDOWN_SECONDS,
  })
  if (!rate.allowed) {
    return { ok: false, unavailable: Boolean(rate.unavailable), retryAfterMs: rate.retryAfterMs }
  }

  const code = String(crypto.randomInt(100000, 1000000))
  return { ok: true, code, expiresAt: Date.now() + CODE_TTL_MS }
}
