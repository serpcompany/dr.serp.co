import { NextResponse } from "next/server"

import { normalizeTarget, fetchDomainRating } from "@/server/dr-providers.mjs"
import { getClaim, recordDrCheck, upsertClaim } from "@/server/db.mjs"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const domain = normalizeTarget(String((body as any)?.domain || ""))
  if (!domain) {
    return NextResponse.json({ error: "Valid domain required" }, { status: 400 })
  }

  try {
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

    return NextResponse.json({
      ok: true,
      domain,
      domainRating,
      provider,
      checkedAt: checkedAt.toISOString(),
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

