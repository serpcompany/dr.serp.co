import { NextResponse } from "next/server"

import { normalizeTarget, fetchDomainRating, fetchDomainRatingHistory } from "@/server/dr-providers.mjs"
import { getClaim, getDrChecks, recordDrCheck, recordDrHistoryChecks, upsertClaim } from "@/server/db.mjs"
import { resolveEntitlement } from "@/server/entitlements.mjs"
import { checkRateLimit, getRateLimitKey } from "@/server/rate-limit.mjs"
import { formatRecheckCadenceError, resolveRecheckCadence } from "@/server/recheck-cadence.mjs"
import { isSpamSite } from "@/server/site-spam.mjs"
import { z } from "zod"
import { readWriteRequest } from "@/server/write-route"

export const runtime = "nodejs"
const RATE_LIMIT_POINTS = Number(process.env.RECHECK_RATE_LIMIT_POINTS ?? 10)
const RATE_LIMIT_DURATION = Number(process.env.RECHECK_RATE_LIMIT_DURATION ?? 60)

function hasStoredRating(value: unknown) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))
}

const RecheckBody = z.object({ domain: z.string({ message: "Valid domain required" }).max(2048) })

export async function POST(request: Request) {
  const read = await readWriteRequest(request, RecheckBody)
  if (!read.ok) return read.response

  const domain = normalizeTarget(read.data.domain)
  if (!domain) {
    return NextResponse.json({ error: "Valid domain required" }, { status: 400 })
  }
  if (isSpamSite({ domain })) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 })
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
    if (isSpamSite({ domain, siteTitle: claim?.site_title })) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 })
    }
    // Only a domain with a stored DR can be rechecked. A first lookup goes through its site page,
    // which applies the new-lookup caps.
    const lastCheck = Array.isArray(checks) ? checks.at(-1) : null
    if (!hasStoredRating(claim?.domain_rating) && !hasStoredRating(lastCheck?.domain_rating)) {
      return NextResponse.json(
        {
          error: "This site has no DR yet. Reload its page to look it up.",
          sitePath: `/sites/${encodeURIComponent(domain)}`,
        },
        { status: 404 }
      )
    }

    const entitlement = claim?.email ? await resolveEntitlement({ email: claim.email }) : null
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
    // History import is a second paid call; only spend it on claimed domains.
    const shouldFetchHistory =
      Boolean(claim?.email) &&
      (provider === "ahrefs" || provider === "ahrefs-api" || Boolean(process.env.AHREFS_API_KEY))

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
        // Provider errors can name internal env vars; log them and return a fixed message.
        console.error("recheck: DR history import failed", error)
        historyWarning = "History temporarily unavailable"
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
  } catch (error) {
    // Report provider failures instead of returning the cached rating as a successful recheck,
    // so the button stays usable and the outage is visible.
    console.error("recheck: DR provider failed", error)
    return NextResponse.json(
      { error: "DR provider is unavailable right now. Please try again later." },
      { status: 503 }
    )
  }
}
