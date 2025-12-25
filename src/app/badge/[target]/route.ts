import fs from "node:fs"
import path from "node:path"

import { fetchDomainRating, normalizeTarget } from "@/server/dr-providers.mjs"
import { getClaim, upsertClaim } from "@/server/db.mjs"

export const runtime = "nodejs"

const templatePath = path.join(process.cwd(), "svgs", "verified-dr.svg")
const badgeTemplate = (globalThis as any).__badgeTemplate || fs.readFileSync(templatePath, "utf8")
;(globalThis as any).__badgeTemplate = badgeTemplate

function renderBadgeSvg(value: string) {
  return badgeTemplate.replace(/<tspan>[^<]*<\/tspan>/, `<tspan>${value}</tspan>`)
}

export async function GET(_request: Request, context: { params: Promise<{ target: string }> }) {
  const params = await context.params
  const normalizedTarget = normalizeTarget(params?.target)
  if (!normalizedTarget) {
    return new Response("Missing target", { status: 400 })
  }

  try {
    const cachedClaim = await getClaim(normalizedTarget)
    if (cachedClaim?.domain_rating !== null && cachedClaim?.domain_rating !== undefined) {
      const dr = Math.max(0, Math.min(100, Math.floor(Number(cachedClaim.domain_rating))))
      const svg = renderBadgeSvg(Number.isFinite(dr) ? String(dr) : "??")
      return new Response(svg, {
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      })
    }

    const result = await fetchDomainRating({ target: normalizedTarget })
    if ((result as any)?.captchaRequired) throw new Error("DR provider requires CAPTCHA")

    const dr = Math.max(0, Math.min(100, Math.floor(Number((result as any)?.domainRating))))
    if (Number.isFinite(dr)) {
      await upsertClaim({ domain: normalizedTarget, domainRating: dr, provider: (result as any)?.provider || null })
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
