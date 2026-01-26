import fs from "node:fs"
import path from "node:path"

import { fetchDomainRating, normalizeTarget } from "@/server/dr-providers.mjs"
import { getClaim, getDrChecks, recordDrCheck, upsertClaim } from "@/server/db.mjs"

export const runtime = "nodejs"

const templates = {
  badge1: path.join(process.cwd(), "svgs", "badges", "verified-dr.svg"),
  "serp-dr-v2": path.join(process.cwd(), "svgs", "badges", "serp-dr-v2.svg"),
  verified: path.join(process.cwd(), "svgs", "badges", "verified-dr.svg"),
}

function resolveTemplatePath(style: string | null) {
  const key = String(style ?? "").trim().toLowerCase()
  if (key && key in templates) return templates[key as keyof typeof templates]
  return templates.verified
}

function readBadgeTemplate(templatePath: string) {
  return fs.readFileSync(templatePath, "utf8")
}

function getFontSizeForValue(value: string) {
  if (value === "??") return "76"
  if (value.length <= 1) return "84"
  if (value.length === 2) return "72"
  return "60"
}

function renderBadgeSvg(templatePath: string, value: string) {
  const badgeTemplate = readBadgeTemplate(templatePath)
  const safeValue = value === "??" ? "??" : value.replace(/[^0-9]/g, "")
  const fontSize = getFontSizeForValue(safeValue || "??")
  return badgeTemplate
    .replaceAll("__DR__", safeValue || "??")
    .replaceAll("__DR_FONT_SIZE__", fontSize)
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
    const svg = renderBadgeSvg(templatePath, Number.isFinite(dr) ? String(dr) : "??")
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
      const svg = renderBadgeSvg(templatePath, Number.isFinite(dr) ? String(dr) : "??")
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

    const svg = renderBadgeSvg(templatePath, Number.isFinite(dr) ? String(dr) : "??")
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    })
  } catch (error) {
    const svg = renderBadgeSvg(templatePath, "??")
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "no-store",
        "X-DR-Error": error instanceof Error ? error.message : "Unknown error",
      },
    })
  }
}
