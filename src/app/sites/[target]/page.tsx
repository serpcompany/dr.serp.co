import { notFound } from "next/navigation"

import { Card } from "@/components/ui/card"
import { getClaim, upsertClaim } from "@/server/db.mjs"
import { fetchDomainRating, normalizeTarget } from "@/server/dr-providers.mjs"
import { EmbedCard } from "./embed-card"

export const runtime = "nodejs"

export default async function SitePage({ params }: { params: Promise<{ target: string }> }) {
  const { target } = await params
  const domain = normalizeTarget(target)
  if (!domain) notFound()

  const publicBase = process.env.DR_PUBLIC_BASE_URL || "https://dr.serp.co"
  const badgeBase = process.env.DR_BADGE_BASE_URL || "https://embeds.serp.co"

  const pageUrl = `${publicBase}/sites/${encodeURIComponent(domain)}`
  const badgeUrl = `${badgeBase}/badge/${encodeURIComponent(domain)}`

  let domainRating: number | null = null
  let provider: string | null = null

  const claim = await getClaim(domain)
  if (claim?.domain_rating !== null && claim?.domain_rating !== undefined) {
    domainRating = Number(claim.domain_rating)
    provider = claim.provider || null
  } else {
    try {
      const result = await fetchDomainRating({ target: domain })
      if ((result as any)?.captchaRequired) {
        domainRating = null
      } else {
        domainRating = Math.max(0, Math.min(100, Math.floor(Number((result as any)?.domainRating))))
        provider = (result as any)?.provider || null
        if (Number.isFinite(domainRating)) {
          await upsertClaim({ domain, domainRating, provider })
        }
      }
    } catch {
      domainRating = null
    }
  }

  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-2xl space-y-6">
        <Card className="p-6">
          <h1 className="text-xl font-semibold">{domain}</h1>
          <p className="text-sm text-muted-foreground">Verified Domain Rating</p>

          <div className="mt-6 flex items-center gap-6">
            <img src={badgeUrl} alt={`Verified DR badge for ${domain}`} width={200} height={50} />
            {domainRating !== null ? (
              <div>
                <div className="text-5xl font-bold">{domainRating}</div>
                {provider ? <div className="text-xs text-muted-foreground">Source: {provider}</div> : null}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Rating unavailable right now.</div>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-sm font-medium mb-3">Embed this badge</h2>
          <EmbedCard pageUrl={pageUrl} badgeUrl={badgeUrl} domain={domain} />
        </Card>
      </div>
    </div>
  )
}
