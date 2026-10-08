const DAY_MS = 24 * 60 * 60 * 1000

export const FREE_RECHECK_INTERVAL_DAYS = 30
export const PAID_RECHECK_INTERVAL_DAYS = 7

/**
 * @param {string | Date | null | undefined} value
 */
function toValidDate(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

/**
 * @param {{ isPaid?: boolean, lastCheckedAt?: string | Date | null, now?: string | Date | null }} [input]
 */
export function resolveRecheckCadence({ isPaid = false, lastCheckedAt = null, now = new Date() } = {}) {
  const checkedAt = toValidDate(lastCheckedAt)
  const currentTime = toValidDate(now) ?? new Date()
  const intervalDays = isPaid ? PAID_RECHECK_INTERVAL_DAYS : FREE_RECHECK_INTERVAL_DAYS

  if (!checkedAt) {
    return {
      tier: isPaid ? "paid" : "free",
      intervalDays,
      canRecheck: true,
      lastCheckedAt: null,
      nextAllowedAt: null,
      retryAfterMs: 0,
    }
  }

  const nextAllowedAt = new Date(checkedAt.getTime() + intervalDays * DAY_MS)
  const retryAfterMs = Math.max(0, nextAllowedAt.getTime() - currentTime.getTime())

  return {
    tier: isPaid ? "paid" : "free",
    intervalDays,
    canRecheck: retryAfterMs <= 0,
    lastCheckedAt: checkedAt,
    nextAllowedAt,
    retryAfterMs,
  }
}

/**
 * @param {{ tier?: string, intervalDays?: number }} cadence
 */
export function formatRecheckCadenceError(cadence) {
  const intervalDays = Number(cadence?.intervalDays) || FREE_RECHECK_INTERVAL_DAYS
  const tier = cadence?.tier === "paid" ? "Paid" : "Free"
  return `${tier} domains can be rechecked once every ${intervalDays} days.`
}
