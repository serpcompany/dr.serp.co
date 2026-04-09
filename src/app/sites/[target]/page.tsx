import { notFound } from "next/navigation"

import { Card, CardContent } from "@/components/ui/card"
import Link from "next/link"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { getClaim, getDrChecks, recordDrCheck, touchDomain, upsertClaim } from "@/server/db.mjs"
import { fetchDomainRating, normalizeTarget } from "@/server/dr-providers.mjs"
import { BadgeEmbed } from "@/components/badges/badge-embed"
import { ClaimClient } from "./claim-client"
import { DrLineLabel } from "./dr-line-label"
import { RecheckButton } from "./recheck-button"
import { DrRadialShape } from "./dr-radial-shape"
import { Section, SectionGroup, SectionHeader, SectionHeaderRow, SectionTitle } from "@/components/content/section"

export const runtime = "nodejs"

async function getDrFromBadgeSvg(badgeUrl: string): Promise<number | null> {
  try {
    const res = await fetch(badgeUrl, {
      cache: "no-store",
      headers: { accept: "image/svg+xml,text/plain;q=0.9,*/*;q=0.8" },
    })
    if (!res.ok) return null
    const svg = await res.text()

    const match =
      svg.match(/<tspan[^>]*id=["']dr-value["'][^>]*>(\d{1,3})<\/tspan>/i) ||
      svg.match(/<tspan[^>]*>(\d{1,3})<\/tspan>/i)
    if (!match) return null

    const value = Number(match[1])
    if (!Number.isFinite(value)) return null

    const clamped = Math.max(0, Math.min(100, Math.floor(value)))
    return Number.isFinite(clamped) ? clamped : null
  } catch {
    return null
  }
}

export default async function SitePage({ params }: { params: Promise<{ target: string }> }) {
  const { target } = await params
  const domain = normalizeTarget(target)
  if (!domain) notFound()

  await touchDomain(domain)

  const embedBase = process.env.DR_PUBLIC_BASE_URL || "https://dr.serp.co"
  const embedBadgeBase = process.env.DR_BADGE_BASE_URL || embedBase
  const embedBadgeUrl = `${embedBadgeBase}/badge/${encodeURIComponent(domain)}?style=serp-dr-v3`

  let domainRating: number | null = null
  let providerForStorage: string | null = null
  let lastCheckedAt: Date | null = null

  let checks = await getDrChecks(domain, { limit: 60 })
  if (checks.length > 0) {
    const last = checks[checks.length - 1]
    const lastValue = Number(last?.domain_rating)
    if (Number.isFinite(lastValue)) domainRating = Math.max(0, Math.min(100, Math.floor(lastValue)))
    providerForStorage = (last as any)?.provider ?? null
    if (last?.checked_at) lastCheckedAt = new Date(last.checked_at)
  }

  const claim = await getClaim(domain)
  if (claim?.domain_rating !== null && claim?.domain_rating !== undefined) {
    domainRating = Number(claim.domain_rating)
    providerForStorage = claim.provider || null
    lastCheckedAt = claim.updated_at ? new Date(claim.updated_at) : null
  } else if (checks.length === 0) {
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
          checks = await getDrChecks(domain, { limit: 60 })
        }
      }
    } catch {
      domainRating = null
    }
  }

  if ((domainRating === null || !Number.isFinite(domainRating)) && checks.length === 0) {
    const badgeDr = await getDrFromBadgeSvg(embedBadgeUrl)
    if (badgeDr !== null) {
      domainRating = badgeDr
      providerForStorage = null
      lastCheckedAt = new Date()
      await upsertClaim({ domain, domainRating, provider: providerForStorage })
      await recordDrCheck({ domain, domainRating, provider: providerForStorage, checkedAt: lastCheckedAt })
      checks = await getDrChecks(domain, { limit: 60 })
    }
  }
  if (checks.length === 0 && domainRating !== null && Number.isFinite(domainRating)) {
    const seedAt = lastCheckedAt || new Date()
    await recordDrCheck({ domain, domainRating, provider: providerForStorage, checkedAt: seedAt })
    checks = await getDrChecks(domain, { limit: 60 })
  }

  if ((domainRating === null || !Number.isFinite(domainRating)) && checks.length > 0) {
    const last = checks[checks.length - 1]
    const lastValue = Number(last?.domain_rating)
    if (Number.isFinite(lastValue)) domainRating = lastValue
    if (!lastCheckedAt && last?.checked_at) lastCheckedAt = new Date(last.checked_at)
  }
  if (!lastCheckedAt && checks.length > 0) {
    const last = checks[checks.length - 1]
    if (last?.checked_at) lastCheckedAt = new Date(last.checked_at)
  }

  const chartPoints =
    checks.length > 0
      ? checks.map((row: any) => ({
          checkedAt: String(row.checked_at),
          domainRating: Number(row.domain_rating),
        }))
      : domainRating !== null && Number.isFinite(domainRating)
        ? [
            {
              checkedAt: (lastCheckedAt || new Date()).toISOString(),
              domainRating: Number(domainRating),
            },
          ]
        : []

  return (
    <SectionGroup>
      <Section>
        <SectionHeaderRow>
          <SectionHeader>
            <div className="flex">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href="/">Home</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href="/sites">Sites</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{domain}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <SectionTitle>{domain}</SectionTitle>
          </SectionHeader>
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
            <RecheckButton domain={domain} />
            <ClaimClient domain={domain} />
          </div>
        </SectionHeaderRow>
      </Section>

      <Section>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <DrRadialShape value={domainRating} />
          </div>

          <Card className="lg:col-span-2">
            <CardContent className="flex flex-1 flex-col items-center justify-center gap-6">
              <BadgeEmbed domain={domain} dr={domainRating} linkUrl={embedBase} badgeUrl={embedBadgeUrl} />
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section>
        <DrLineLabel points={chartPoints} />
      </Section>
    </SectionGroup>
  )
}
