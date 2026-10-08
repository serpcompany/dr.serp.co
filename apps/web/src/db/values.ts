// Conversions between request values and the TEXT and INTEGER columns D1 stores.

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

// A Domain Rating as stored: an integer from 0 to 100, or null when the value isn't a number.
export function clampDr(value: unknown): number | null {
  const dr = Math.max(0, Math.min(100, Math.floor(Number(value))))
  return Number.isFinite(dr) ? dr : null
}

export function coerceDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date : null
  }
  return null
}

// Timestamps are stored as ISO-8601 UTC text.
export function isoText(value: unknown, fallback: string | null = null): string | null {
  const date = coerceDate(value)
  return date ? date.toISOString() : fallback
}

export function nowIsoText() {
  return new Date().toISOString()
}

export function clampOffset(value: unknown) {
  return isFiniteNumber(value) ? Math.max(0, Math.floor(value)) : 0
}
