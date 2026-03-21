import { RateLimiterMemory, RateLimiterRedis } from "rate-limiter-flexible"
import Redis from "ioredis"

const limiterCache = new Map()
const redisClientKey = "__dr_serp_rate_limit_redis__"
const redisUrl = process.env.RATE_LIMIT_REDIS_URL || process.env.REDIS_URL || ""

function getRedisClient() {
  if (!redisUrl) return null
  const cached = globalThis[redisClientKey]
  if (cached) return cached
  try {
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })
    globalThis[redisClientKey] = client
    return client
  } catch {
    return null
  }
}

function getLimiter(points, duration) {
  const key = `${points}:${duration}`
  if (!limiterCache.has(key)) {
    const redisClient = getRedisClient()
    const limiter = redisClient
      ? new RateLimiterRedis({ storeClient: redisClient, points, duration })
      : new RateLimiterMemory({ points, duration })
    limiterCache.set(key, limiter)
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
