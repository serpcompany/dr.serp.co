import { NextResponse } from "next/server"

import { readRequestJsonRecord } from "@/lib/read-json"
import { normalizeTarget, fetchDomainRating, fetchDomainRatingHistory } from "@/server/dr-providers.mjs"
import { getClaim, getDrChecks, recordDrCheck, recordDrHistoryChecks, upsertClaim } from "@/server/db.mjs"
import { resolveEntitlement } from "@/server/entitlements.mjs"
import { checkRateLimit, getRateLimitKey } from "@/server/rate-limit.mjs"
import { formatRecheckCadenceError, resolveRecheckCadence } from "@/server/recheck-cadence.mjs"

export const runtime = "nodejs"
const RATE_LIMIT_POINTS = Number(process.env.RECHECK_RATE_LIMIT_POINTS ?? 10)
const RATE_LIMIT_DURATION = Number(process.env.RECHECK_RATE_LIMIT_DURATION ?? 60)

export async function POST(request: Request) {
  const body = await readRequestJsonRecord(request)
  const domain = normalizeTarget(String(body?.domain || ""))
  if (!domain) {
    return NextResponse.json({ error: "Valid domain required" }, { status: 400 })
  }

  const rateKey = getRateLimitKey(request, "dr-recheck")
  const rate = await checkRateLimit({ key: rateKey, points: RATE_LIMIT_POINTS, duration: RATE_LIMIT_DURATION })
  if (!rate.allowed) {
    const retryAfter = Math.ceil(rate.retryAfterMs / 1000)
    return NextResponse.json(
      { error: "Too many recheck requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    )
  }

  try {
    const [claim, checks] = await Promise.all([getClaim(domain), getDrChecks(domain, { limit: 1 })])
    const entitlement = claim?.email ? await resolveEntitlement({ email: claim.email }) : null
    const lastCheck = Array.isArray(checks) ? checks.at(-1) : null
    const cadence = resolveRecheckCadence({
      isPaid: Boolean(entitlement?.canAccessPaidFeatures),
      lastCheckedAt: lastCheck?.checked_at ?? claim?.updated_at ?? null,
    })
    if (!cadence.canRecheck) {
      const retryAfter = Math.ceil(cadence.retryAfterMs / 1000)
      return NextResponse.json(
        {
          error: formatRecheckCadenceError(cadence),
          nextAllowedAt: cadence.nextAllowedAt?.toISOString() ?? null,
          intervalDays: cadence.intervalDays,
          tier: cadence.tier,
        },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      )
    }

    const result = await fetchDomainRating({ target: domain })
    if ((result as any)?.captchaRequired) {
      throw new Error("captchaRequired")
    }

    const provider = (result as any)?.provider || null
    const domainRating = Math.max(0, Math.min(100, Math.floor(Number((result as any)?.domainRating))))
    if (!Number.isFinite(domainRating)) {
      return NextResponse.json({ error: "Rating unavailable right now" }, { status: 503 })
    }

    const updated = await upsertClaim({ domain, domainRating, provider })
    const checkedAt = updated?.updated_at ? new Date(updated.updated_at) : new Date()
    await recordDrCheck({ domain, domainRating, provider, checkedAt })

    let historyPointCount = 0
    let historyWarning: string | null = null
    const shouldFetchHistory =
      provider === "ahrefs" || provider === "ahrefs-api" || Boolean(process.env.AHREFS_API_KEY)

    if (shouldFetchHistory) {
      try {
        const history = await fetchDomainRatingHistory({ target: domain })
        const recorded = await recordDrHistoryChecks({
          domain,
          provider: (history as any)?.provider ?? "ahrefs-history",
          points: Array.isArray((history as any)?.points) ? (history as any).points : [],
        })
        historyPointCount = recorded.length
      } catch (error) {
        historyWarning = error instanceof Error ? error.message : "History temporarily unavailable"
      }
    }

    const nextCadence = resolveRecheckCadence({
      isPaid: cadence.tier === "paid",
      lastCheckedAt: checkedAt,
    })

    return NextResponse.json({
      ok: true,
      domain,
      domainRating,
      provider,
      checkedAt: checkedAt.toISOString(),
      nextAllowedAt: nextCadence.nextAllowedAt?.toISOString() ?? null,
      intervalDays: nextCadence.intervalDays,
      tier: nextCadence.tier,
      historyPointCount,
      ...(historyWarning ? { historyWarning } : {}),
    })
  } catch {
    // Provider failed — return the last cached rating if available
    const cached = await getClaim(domain).catch(() => null)
    if (cached?.domain_rating != null) {
      const dr = Math.max(0, Math.min(100, Math.floor(Number(cached.domain_rating))))
      if (Number.isFinite(dr)) {
        return NextResponse.json({
          ok: true,
          domain,
          domainRating: dr,
          provider: cached.provider ?? null,
          checkedAt: cached.updated_at ? new Date(cached.updated_at).toISOString() : null,
          stale: true,
        })
      }
    }
    return NextResponse.json({ error: "Rating temporarily unavailable" }, { status: 503 })
  }
}
