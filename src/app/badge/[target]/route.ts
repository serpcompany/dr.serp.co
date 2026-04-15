import fs from "node:fs"
import path from "node:path"

import { fetchDomainRating, normalizeTarget } from "@/server/dr-providers.mjs"
import { getClaim, getDrChecks, recordDrCheck, upsertClaim } from "@/server/db.mjs"

export const runtime = "nodejs"

const templates = {
  badge1: path.join(process.cwd(), "svgs", "badges", "serp-dr-v3.svg"),
  "serp-dr-v2": path.join(process.cwd(), "svgs", "badges", "serp-dr-v2.svg"),
  "serp-dr-v3": path.join(process.cwd(), "svgs", "badges", "serp-dr-v3.svg"),
  verified: path.join(process.cwd(), "svgs", "badges", "serp-dr-v3.svg"),
} as const

const DEFAULT_STYLE: keyof typeof templates = "serp-dr-v3"
const DEFAULT_DR_VALUE = "0"
const templateCache = new Map<string, string>()

// Refresh DR if data is older than 30 days
const STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000

function resolveTemplatePath(style: string | null) {
  const key = String(style ?? "").trim().toLowerCase()
  if (key && key in templates) return templates[key as keyof typeof templates]
  return templates[DEFAULT_STYLE]
}

function getBadgeTemplate(templatePath: string) {
  const cached = templateCache.get(templatePath)
  if (cached) return cached

  const template = fs.readFileSync(templatePath, "utf8")
  templateCache.set(templatePath, template)
  return template
}

function getFontSizeForValue(value: string) {
  if (value.length <= 1) return "84"
  if (value.length === 2) return "72"
  return "60"
}

// Total path length of the 300° horseshoe arc (r=13): (300/360) * 2π * 13
const RING_ARC_LENGTH = (300 / 360) * 2 * Math.PI * 13

function computeDasharray(value: string): string {
  const score = parseInt(value, 10)
  if (!Number.isFinite(score)) return `0 ${RING_ARC_LENGTH.toFixed(2)}`
  const clamped = Math.max(0, Math.min(100, score))
  const filled = (clamped / 100) * RING_ARC_LENGTH
  const gap = RING_ARC_LENGTH - filled
  return `${filled.toFixed(2)} ${gap.toFixed(2)}`
}

function renderBadgeSvg(templatePath: string, value: string) {
  const template = getBadgeTemplate(templatePath)
  const safeValue = value.replace(/[^0-9]/g, "")
  const normalizedValue = safeValue || DEFAULT_DR_VALUE

  let svg = template.replaceAll("__DR__", normalizedValue)

  if (svg.includes("__DR_DASHARRAY__")) {
    svg = svg.replaceAll("__DR_DASHARRAY__", computeDasharray(normalizedValue))
  }

  if (svg.includes("__DR_FONT_SIZE__")) {
    svg = svg.replaceAll("__DR_FONT_SIZE__", getFontSizeForValue(normalizedValue))
  }

  return svg
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
  const templatePath = resolveTemplatePath(url.searchParams.get("style"))
  const override = url.searchParams.get("dr")
  if (override !== null) {
    const dr = Math.max(0, Math.min(100, Math.floor(Number(override))))
    const svg = renderBadgeSvg(templatePath, Number.isFinite(dr) ? String(dr) : DEFAULT_DR_VALUE)
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
      const svg = renderBadgeSvg(templatePath, Number.isFinite(dr) ? String(dr) : DEFAULT_DR_VALUE)
      
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
        const svg = renderBadgeSvg(templatePath, String(dr))
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

    const svg = renderBadgeSvg(templatePath, Number.isFinite(dr) ? String(dr) : DEFAULT_DR_VALUE)
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    })
  } catch (error) {
    const svg = renderBadgeSvg(templatePath, DEFAULT_DR_VALUE)
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "no-store",
        "X-DR-Error": error instanceof Error ? error.message : "Unknown error",
      },
    })
  }
}
