import { notFound } from "next/navigation"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getClaim, getDrChecks, recordDrCheck, upsertClaim } from "@/server/db.mjs"
import { fetchDomainRating, normalizeTarget } from "@/server/dr-providers.mjs"
import { EmbedCard } from "./embed-card"
import { ClaimClient } from "./claim-client"
import { DrLineLabel } from "./dr-line-label"
import { RecheckButton } from "./recheck-button"
import { DrRadialShape } from "./dr-radial-shape"

export const runtime = "nodejs"

export default async function SitePage({ params }: { params: Promise<{ target: string }> }) {
  const { target } = await params
  const domain = normalizeTarget(target)
  if (!domain) notFound()

  const publicBase = process.env.DR_PUBLIC_BASE_URL || "https://dr.serp.co"
  const badgeBase = process.env.DR_BADGE_BASE_URL || publicBase

  const pageUrl = `${publicBase}/sites/${encodeURIComponent(domain)}`
  const badgeUrl = `${badgeBase}/badge/${encodeURIComponent(domain)}`

  let domainRating: number | null = null
  let providerForStorage: string | null = null
  let lastCheckedAt: Date | null = null

  const claim = await getClaim(domain)
  if (claim?.domain_rating !== null && claim?.domain_rating !== undefined) {
    domainRating = Number(claim.domain_rating)
    providerForStorage = claim.provider || null
    lastCheckedAt = claim.updated_at ? new Date(claim.updated_at) : null
  } else {
    try {
      const result = await fetchDomainRating({ target: domain })
      if ((result as any)?.captchaRequired) {
        domainRating = null
      } else {
        domainRating = Math.max(0, Math.min(100, Math.floor(Number((result as any)?.domainRating))))
        if (Number.isFinite(domainRating)) {
          providerForStorage = (result as any)?.provider || null
          const updated = await upsertClaim({ domain, domainRating, provider: providerForStorage })
          lastCheckedAt = updated?.updated_at ? new Date(updated.updated_at) : new Date()
          await recordDrCheck({
            domain,
            domainRating,
            provider: providerForStorage,
            checkedAt: lastCheckedAt,
          })
        }
      }
    } catch {
      domainRating = null
    }
  }

  let checks = await getDrChecks(domain, { limit: 60 })
  if (checks.length === 0 && domainRating !== null && Number.isFinite(domainRating)) {
    const seedAt = lastCheckedAt || new Date()
    await recordDrCheck({ domain, domainRating, provider: providerForStorage, checkedAt: seedAt })
    checks = await getDrChecks(domain, { limit: 60 })
  }
  if (!lastCheckedAt && checks.length > 0) {
    const last = checks[checks.length - 1]
    if (last?.checked_at) lastCheckedAt = new Date(last.checked_at)
  }

  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-4xl space-y-6">
        <header className="space-y-2 text-center">
          <h1 className="scroll-m-20 text-3xl font-semibold tracking-tight">{domain}</h1>
        </header>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-1 space-y-4">
            <DrRadialShape value={domainRating} />
          </div>

          <Card className="md:col-span-2">
            <CardContent className="space-y-4">
              <div className="flex justify-center">
                <img
                  src={badgeUrl}
                  alt={`Verified DR badge for ${domain}`}
                  width={360}
                  height={90}
                  className="max-w-full"
                />
              </div>
              <EmbedCard pageUrl={pageUrl} badgeUrl={badgeUrl} domain={domain} />
            </CardContent>
          </Card>
        </div>

        <DrLineLabel
          points={checks.map((row: any) => ({
            checkedAt: String(row.checked_at),
            domainRating: Number(row.domain_rating),
          }))}
        />
      </div>
    </div>
  )
}
