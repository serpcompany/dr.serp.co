const memoryBuckets = new Map()

function normalizeLimit(value, fallback) {
  const number = Math.floor(Number(value))
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function toLimitResponse(value, fallbackRetryAfterMs) {
  return {
    allowed: Boolean(value?.allowed),
    unavailable: false,
    remaining: Math.max(0, Math.floor(Number(value?.remaining) || 0)),
    retryAfterMs: Math.max(0, Math.floor(Number(value?.retryAfterMs) || fallbackRetryAfterMs))
  }
}

async function getRateLimiterBinding() {
  // `next dev` gets wrangler.jsonc's bindings from getPlatformProxy, which can't run a Durable
  // Object class defined in the Worker itself, so RATE_LIMITER exists there but every call fails.
  // Development counts in memory instead; `pnpm preview` and deployed Workers use the object.
  if (process.env.NODE_ENV === 'development') return null
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    return getCloudflareContext()?.env?.RATE_LIMITER ?? null
  } catch {
    return null
  }
}

async function checkDurableObjectRateLimit({ binding, key, points, duration }) {
  const stub = binding.get(binding.idFromName(String(key)))
  const retryAfterMs = duration * 1000
  const response = await stub.fetch('https://rate-limit.local/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points, duration })
  })

  if (!response.ok) {
    throw new Error(`Rate limiter Durable Object failed with ${response.status}`)
  }

  // An answer that isn't JSON is a fault, not a limit decision: let it take the outage path.
  const payload = await response.json().catch(() => {
    throw new Error('Rate limiter Durable Object answered with invalid JSON')
  })
  return toLimitResponse(payload, retryAfterMs)
}

function checkMemoryRateLimit({ key, points, duration }) {
  const now = Date.now()
  const retryAfterMs = duration * 1000
  const bucketKey = `${key}:${points}:${duration}`
  const current = memoryBuckets.get(bucketKey)
  const bucket =
    current && Number(current.resetAt) > now ? current : { count: 0, resetAt: now + retryAfterMs }

  if (bucket.count >= points) {
    memoryBuckets.set(bucketKey, bucket)
    return {
      allowed: false,
      unavailable: false,
      remaining: 0,
      retryAfterMs: Math.max(0, bucket.resetAt - now)
    }
  }

  bucket.count += 1
  memoryBuckets.set(bucketKey, bucket)

  return {
    allowed: true,
    unavailable: false,
    remaining: Math.max(0, points - bucket.count),
    retryAfterMs: Math.max(0, bucket.resetAt - now)
  }
}

export function getRateLimitKey(request, prefix) {
  const cloudflareIp = request.headers.get('cf-connecting-ip')?.trim()
  if (cloudflareIp) return `${prefix}:${cloudflareIp}`

  const forwarded = request.headers.get('x-forwarded-for') || ''
  const ip = forwarded.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
  return `${prefix}:${ip}`
}

/** What a route tells the visitor when the limiter itself is down: not a cooldown, a 503. */
export const RATE_LIMITER_UNAVAILABLE_MESSAGE =
  'This is unavailable right now. Please try again shortly.'

export async function checkRateLimit({ key, points, duration }) {
  const safeKey = String(key ?? '').trim() || 'unknown'
  const safePoints = normalizeLimit(points, 1)
  const safeDuration = normalizeLimit(duration, 60)

  const binding = await getRateLimiterBinding()
  if (binding) {
    try {
      return await checkDurableObjectRateLimit({
        binding,
        key: safeKey,
        points: safePoints,
        duration: safeDuration
      })
    } catch (error) {
      // Fail closed, but say so: callers answer 503 instead of a cooldown, and the outage is logged.
      // The key's prefix names the limit; the rest is an IP or email, so it stays out of the log.
      console.error('rate-limit: limiter unavailable', {
        limit: safeKey.split(':')[0],
        error: error instanceof Error ? error.message : String(error)
      })
      return { allowed: false, unavailable: true, remaining: 0, retryAfterMs: safeDuration * 1000 }
    }
  }

  return checkMemoryRateLimit({
    key: safeKey,
    points: safePoints,
    duration: safeDuration
  })
}
