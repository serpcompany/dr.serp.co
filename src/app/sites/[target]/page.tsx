import { notFound } from "next/navigation"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { normalizeTarget } from "@/server/dr-providers.mjs"
import { BadgeEmbed } from "@/components/badges/badge-embed"
import { ClaimClient } from "./claim-client"
import { DrLineLabel } from "./dr-line-label"
import { RecheckButton } from "./recheck-button"
import { DrRadialShape } from "./dr-radial-shape"
import { loadSiteSnapshot } from "./site-snapshot"

export const runtime = "nodejs"

export default async function SitePage({ params }: { params: Promise<{ target: string }> }) {
  const { target } = await params
  const domain = normalizeTarget(target)
  if (!domain) notFound()

  const embedBase = process.env.DR_PUBLIC_BASE_URL || "https://dr.serp.co"
  const embedBadgeBase = process.env.DR_BADGE_BASE_URL || embedBase
  const embedBadgeUrl = `${embedBadgeBase}/badge/${encodeURIComponent(domain)}?style=serp-dr-v3`
  const { chartPoints, domainRating } = await loadSiteSnapshot(domain)

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
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
            <h1 className="text-2xl font-semibold tracking-tight">{domain}</h1>
          </div>
          <div className="flex items-center gap-2">
            <RecheckButton domain={domain} />
            <ClaimClient domain={domain} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <DrRadialShape value={domainRating} />
        </div>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Embed Badge</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center">
            <BadgeEmbed domain={domain} dr={domainRating} linkUrl={embedBase} badgeUrl={embedBadgeUrl} />
          </CardContent>
        </Card>
      </div>

      <DrLineLabel points={chartPoints} />
    </main>
  )
}
