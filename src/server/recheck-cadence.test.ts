import { describe, expect, it } from "vitest"

import {
  FREE_RECHECK_INTERVAL_DAYS,
  PAID_RECHECK_INTERVAL_DAYS,
  formatRecheckCadenceError,
  resolveRecheckCadence,
} from "@/server/recheck-cadence.mjs"

describe("resolveRecheckCadence", () => {
  const now = new Date("2026-06-20T00:00:00.000Z")

  it("allows domains with no previous check", () => {
    const cadence = resolveRecheckCadence({ now })

    expect(cadence).toMatchObject({
      tier: "free",
      intervalDays: FREE_RECHECK_INTERVAL_DAYS,
      canRecheck: true,
      lastCheckedAt: null,
      nextAllowedAt: null,
      retryAfterMs: 0,
    })
  })

  it("limits free domains to a 30 day interval", () => {
    const cadence = resolveRecheckCadence({
      now,
      lastCheckedAt: "2026-06-01T00:00:00.000Z",
    })

    expect(cadence.canRecheck).toBe(false)
    expect(cadence.tier).toBe("free")
    expect(cadence.intervalDays).toBe(FREE_RECHECK_INTERVAL_DAYS)
    expect(cadence.nextAllowedAt?.toISOString()).toBe("2026-07-01T00:00:00.000Z")
    expect(formatRecheckCadenceError(cadence)).toBe("Free domains can be rechecked once every 30 days.")
  })

  it("limits paid domains to a 7 day interval", () => {
    const cadence = resolveRecheckCadence({
      now,
      isPaid: true,
      lastCheckedAt: "2026-06-14T00:00:00.000Z",
    })

    expect(cadence.canRecheck).toBe(false)
    expect(cadence.tier).toBe("paid")
    expect(cadence.intervalDays).toBe(PAID_RECHECK_INTERVAL_DAYS)
    expect(cadence.nextAllowedAt?.toISOString()).toBe("2026-06-21T00:00:00.000Z")
    expect(formatRecheckCadenceError(cadence)).toBe("Paid domains can be rechecked once every 7 days.")
  })
})
