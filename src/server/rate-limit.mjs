const memoryBuckets = new Map()

function normalizeLimit(value, fallback) {
  const number = Math.floor(Number(value))
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function toLimitResponse(value, fallbackRetryAfterMs) {
  return {
    allowed: Boolean(value?.allowed),
    remaining: Math.max(0, Math.floor(Number(value?.remaining) || 0)),
    retryAfterMs: Math.max(0, Math.floor(Number(value?.retryAfterMs) || fallbackRetryAfterMs)),
  }
}

async function getRateLimiterBinding() {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare")
    return getCloudflareContext()?.env?.RATE_LIMITER ?? null
  } catch {
    return null
  }
}

async function checkDurableObjectRateLimit({ binding, key, points, duration }) {
  const stub = binding.get(binding.idFromName(String(key)))
  const retryAfterMs = duration * 1000
  const response = await stub.fetch("https://rate-limit.local/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ points, duration }),
  })

  if (!response.ok) {
    throw new Error(`Rate limiter Durable Object failed with ${response.status}`)
  }

  const payload = await response.json().catch(() => null)
  return toLimitResponse(payload, retryAfterMs)
}

function checkMemoryRateLimit({ key, points, duration }) {
  const now = Date.now()
  const retryAfterMs = duration * 1000
  const bucketKey = `${key}:${points}:${duration}`
  const current = memoryBuckets.get(bucketKey)
  const bucket =
    current && Number(current.resetAt) > now
      ? current
      : { count: 0, resetAt: now + retryAfterMs }

  if (bucket.count >= points) {
    memoryBuckets.set(bucketKey, bucket)
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, bucket.resetAt - now),
    }
  }

  bucket.count += 1
  memoryBuckets.set(bucketKey, bucket)

  return {
    allowed: true,
    remaining: Math.max(0, points - bucket.count),
    retryAfterMs: Math.max(0, bucket.resetAt - now),
  }
}

export function getRateLimitKey(request, prefix) {
  const cloudflareIp = request.headers.get("cf-connecting-ip")?.trim()
  if (cloudflareIp) return `${prefix}:${cloudflareIp}`

  const forwarded = request.headers.get("x-forwarded-for") || ""
  const ip = forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown"
  return `${prefix}:${ip}`
}

export async function checkRateLimit({ key, points, duration }) {
  const safeKey = String(key ?? "").trim() || "unknown"
  const safePoints = normalizeLimit(points, 1)
  const safeDuration = normalizeLimit(duration, 60)

  const binding = await getRateLimiterBinding()
  if (binding) {
    try {
      return await checkDurableObjectRateLimit({
        binding,
        key: safeKey,
        points: safePoints,
        duration: safeDuration,
      })
    } catch {
      return { allowed: false, remaining: 0, retryAfterMs: safeDuration * 1000 }
    }
  }

  return checkMemoryRateLimit({
    key: safeKey,
    points: safePoints,
    duration: safeDuration,
  })
}
