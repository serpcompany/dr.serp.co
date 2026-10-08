import { DurableObject } from "cloudflare:workers"

function normalizeLimit(value, fallback) {
  const number = Math.floor(Number(value))
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function json(payload, init) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })
}

export class RateLimitDurableObject extends DurableObject {
  constructor(state, env) {
    super(state, env)
    this.state = state
    this.env = env
  }

  async fetch(request) {
    if (request.method !== "POST") {
      return json({ error: "Not found." }, { status: 404 })
    }

    let payload = null
    try {
      payload = await request.json()
    } catch {
      return json({ error: "Invalid JSON." }, { status: 400 })
    }

    const points = normalizeLimit(payload?.points, 1)
    const duration = normalizeLimit(payload?.duration, 60)
    const now = Date.now()
    const windowMs = duration * 1000
    const stored = await this.state.storage.get("bucket")
    const current =
      stored &&
      stored.points === points &&
      stored.duration === duration &&
      Number(stored.resetAt) > now
        ? stored
        : { points, duration, count: 0, resetAt: now + windowMs }

    if (current.count >= points) {
      return json({
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, current.resetAt - now),
      })
    }

    const next = {
      points,
      duration,
      count: current.count + 1,
      resetAt: current.resetAt,
    }
    await this.state.storage.put("bucket", next)
    if (typeof this.state.storage.setAlarm === "function") {
      await this.state.storage.setAlarm(next.resetAt)
    }

    return json({
      allowed: true,
      remaining: Math.max(0, points - next.count),
      retryAfterMs: Math.max(0, next.resetAt - now),
    })
  }

  async alarm() {
    await this.state.storage.delete("bucket")
  }
}
