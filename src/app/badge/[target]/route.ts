import fs from "node:fs"
import path from "node:path"

import { fetchDomainRating, normalizeTarget } from "@/server/dr-providers.mjs"
import { getClaim, getDrChecks, recordDrCheck, upsertClaim } from "@/server/db.mjs"

export const runtime = "nodejs"

const templatePath = path.join(process.cwd(), "svgs", "badges", "serp-dr-v2.svg")
let cachedTemplate: string | null = null

// Refresh DR if data is older than 30 days
const STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000

function getBadgeTemplate() {
  if (!cachedTemplate) {
    cachedTemplate = fs.readFileSync(templatePath, "utf8")
  }
  return cachedTemplate
}

function renderBadgeSvg(value: string) {
  const template = getBadgeTemplate()
  const safeValue = value === "??" ? "??" : value.replace(/[^0-9]/g, "")
  return template.replaceAll("__DR__", safeValue || "??")
}

function isStale(updatedAt: Date | string | null | undefined): boolean {
  if (!updatedAt) return true
  const updated = new Date(updatedAt)
  return Date.now() - updated.getTime() > STALE_THRESHOLD_MS
}

async function refreshDrInBackground(domain: string) {
  try {
    const result = await fetchDomainRating({ target: domain })
    if ((result as any)?.captchaRequired) return
    
    const dr = Math.max(0, Math.min(100, Math.floor(Number((result as any)?.domainRating))))
    if (Number.isFinite(dr)) {
      const provider = (result as any)?.provider || null
      const updated = await upsertClaim({ domain, domainRating: dr, provider })
      const checkedAt = updated?.updated_at ? new Date(updated.updated_at) : new Date()
      await recordDrCheck({ domain, domainRating: dr, provider, checkedAt })
    }
  } catch {
    // Silently fail background refresh
  }
}

export async function GET(request: Request, context: { params: Promise<{ target: string }> }) {
  const params = await context.params
  const normalizedTarget = normalizeTarget(params?.target)
  if (!normalizedTarget) {
    return new Response("Missing target", { status: 400 })
  }

  const url = new URL(request.url)
  const override = url.searchParams.get("dr")
  if (override !== null) {
    const dr = Math.max(0, Math.min(100, Math.floor(Number(override))))
    const svg = renderBadgeSvg(Number.isFinite(dr) ? String(dr) : "??")
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "no-store",
      },
    })
  }

  try {
    const cachedClaim = await getClaim(normalizedTarget)
    if (cachedClaim?.domain_rating !== null && cachedClaim?.domain_rating !== undefined) {
      const dr = Math.max(0, Math.min(100, Math.floor(Number(cachedClaim.domain_rating))))
      const svg = renderBadgeSvg(Number.isFinite(dr) ? String(dr) : "??")
      
      // Trigger background refresh if data is older than 30 days
      if (isStale(cachedClaim.updated_at)) {
        refreshDrInBackground(normalizedTarget)
      }
      
      return new Response(svg, {
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      })
    }

    const checks = await getDrChecks(normalizedTarget, { limit: 1 })
    if (checks.length > 0) {
      const last = checks[checks.length - 1] as any
      const dr = Math.max(0, Math.min(100, Math.floor(Number(last?.domain_rating))))
      if (Number.isFinite(dr)) {
        await upsertClaim({ domain: normalizedTarget, domainRating: dr, provider: last?.provider ?? null })
        const svg = renderBadgeSvg(String(dr))
        return new Response(svg, {
          headers: {
            "Content-Type": "image/svg+xml; charset=utf-8",
            "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
          },
        })
      }
    }

    const result = await fetchDomainRating({ target: normalizedTarget })
    if ((result as any)?.captchaRequired) throw new Error("DR provider requires CAPTCHA")

    const dr = Math.max(0, Math.min(100, Math.floor(Number((result as any)?.domainRating))))
    if (Number.isFinite(dr)) {
      const provider = (result as any)?.provider || null
      const updated = await upsertClaim({ domain: normalizedTarget, domainRating: dr, provider })
      const checkedAt = updated?.updated_at ? new Date(updated.updated_at) : new Date()
      await recordDrCheck({ domain: normalizedTarget, domainRating: dr, provider, checkedAt })
    }

    const svg = renderBadgeSvg(Number.isFinite(dr) ? String(dr) : "??")
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    })
  } catch (error) {
    const svg = renderBadgeSvg("??")
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "no-store",
        "X-DR-Error": error instanceof Error ? error.message : "Unknown error",
      },
    })
  }
}
