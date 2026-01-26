import { RateLimiterMemory } from "rate-limiter-flexible"

const limiterCache = new Map()

function getLimiter(points, duration) {
  const key = `${points}:${duration}`
  if (!limiterCache.has(key)) {
    limiterCache.set(key, new RateLimiterMemory({ points, duration }))
  }
  return limiterCache.get(key)
}

export function getRateLimitKey(request, prefix) {
  const forwarded = request.headers.get("x-forwarded-for") || ""
  const ip = forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown"
  return `${prefix}:${ip}`
}

export async function checkRateLimit({ key, points, duration }) {
  const limiter = getLimiter(points, duration)
  try {
    const res = await limiter.consume(key)
    return { allowed: true, remaining: res.remainingPoints, retryAfterMs: res.msBeforeNext }
  } catch (err) {
    const res = err?.remainingPoints !== undefined ? err : null
    return {
      allowed: false,
      remaining: res?.remainingPoints ?? 0,
      retryAfterMs: res?.msBeforeNext ?? duration * 1000,
    }
  }
}
