import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { BadgeEmbed } from '@/components/badges/badge-embed'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getPublicBaseUrl } from '@/lib/public-url'
import { getSessionEmail } from '@/server/auth/session'
import { normalizeTarget } from '@/server/dr-providers.mjs'
import { resolveEntitlement } from '@/server/entitlements.mjs'
import { getRateLimitKey } from '@/server/rate-limit.mjs'
import { resolveRecheckCadence } from '@/server/recheck-cadence.mjs'
import { isSpamSite } from '@/server/site-spam.mjs'
import { ClaimClient } from './claim-client'
import { DrLineLabel } from './dr-line-label'
import { DrRadialShape } from './dr-radial-shape'
import { RecheckButton } from './recheck-button'
import {
  buildSitePageMetadata,
  getOutboundLinkProps,
  getPageSiteDescription,
  getPageSiteTitle
} from './site-page-helpers'
import { loadSiteSnapshot } from './site-snapshot'

export const runtime = 'nodejs'

const getSitePageData = cache(async (domain: string) =>
  loadSiteSnapshot(domain, {
    rateLimitKey: getRateLimitKey({ headers: await headers() }, 'new-site-lookup')
  })
)

export async function generateMetadata({
  params
}: {
  params: Promise<{ target: string }>
}): Promise<Metadata> {
  const { target } = await params
  const domain = normalizeTarget(target)
  if (!domain || isSpamSite({ domain })) return {}

  const site = await getSitePageData(domain)
  const pageSiteTitle = getPageSiteTitle({ siteTitle: site.siteTitle, domain })
  const description = getPageSiteDescription({ metaDescription: site.metaDescription, domain })

  return buildSitePageMetadata({ pageSiteTitle, description })
}

export default async function SitePage({ params }: { params: Promise<{ target: string }> }) {
  const { target } = await params
  const domain = normalizeTarget(target)
  // Spam domains get no page and no paid DR lookup; loadSiteSnapshot skips the lookup for spam titles.
  if (!domain || isSpamSite({ domain })) notFound()

  const embedBase = getPublicBaseUrl()
  const embedLinkUrl = `${embedBase}/sites/${encodeURIComponent(domain)}`
  const embedBadgeBase = process.env.DR_BADGE_BASE_URL || embedBase
  const embedBadgeUrl = `${embedBadgeBase}/badge/${encodeURIComponent(domain)}?style=serp-dr-v3`
  const {
    chartPoints,
    domainRating,
    lastCheckedAt,
    claimEmail,
    siteTitle,
    metaDescription,
    siteUrl,
    screenshotUrl,
    lookupError
  } = await getSitePageData(domain)
  if (isSpamSite({ domain, siteTitle })) notFound()
  const entitlement = claimEmail ? await resolveEntitlement({ email: claimEmail }) : null
  // Resolve ownership on the server so the owner's email is never sent to visitors.
  const viewerEmail = await getSessionEmail({ headers: await headers() })
  const ownerEmail = claimEmail?.trim().toLowerCase() || null
  const claimStatus = !ownerEmail ? 'none' : ownerEmail === viewerEmail ? 'mine' : 'other'
  const isPaidLink = Boolean(entitlement?.canAccessPaidFeatures)
  const recheckCadence = resolveRecheckCadence({ isPaid: isPaidLink, lastCheckedAt })
  const pageSiteTitle = getPageSiteTitle({ siteTitle, domain })
  const pageDescription = getPageSiteDescription({ metaDescription, domain })
  const outboundUrl = siteUrl || `https://${domain}`
  const outboundLinkProps = getOutboundLinkProps(isPaidLink)

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink render={<Link href="/" />}>Home</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink render={<Link href="/sites" />}>Sites</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{domain}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight">{pageSiteTitle}</h1>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <a
                  href={outboundUrl}
                  className="font-medium text-foreground underline underline-offset-4"
                  {...outboundLinkProps}
                >
                  {domain}
                </a>
                <span aria-hidden="true">·</span>
                <span>
                  {isPaidLink
                    ? 'Premium dofollow outbound link'
                    : 'Standard nofollow outbound link'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {domainRating !== null ? (
              // Only a stored DR can be rechecked; a first lookup happens when the page loads.
              <RecheckButton
                domain={domain}
                canRecheck={recheckCadence.canRecheck}
                nextAllowedAt={recheckCadence.nextAllowedAt?.toISOString() ?? null}
                intervalDays={recheckCadence.intervalDays}
                tier={recheckCadence.tier === 'paid' ? 'paid' : 'free'}
              />
            ) : null}
            <ClaimClient
              domain={domain}
              claimStatus={claimStatus}
              signedIn={Boolean(viewerEmail)}
            />
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
            <BadgeEmbed
              domain={domain}
              dr={domainRating}
              linkUrl={embedLinkUrl}
              badgeUrl={embedBadgeUrl}
            />
          </CardContent>
        </Card>
      </div>

      {screenshotUrl ? (
        <Card>
          <CardHeader>
            <CardTitle>Site Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <a
              href={outboundUrl}
              className="block overflow-hidden rounded-xl border"
              {...outboundLinkProps}
            >
              {/* biome-ignore lint/performance/noImgElement: a remote screenshot; the Worker has no image optimizer */}
              <img
                src={screenshotUrl}
                alt={`${pageSiteTitle} homepage preview`}
                className="aspect-[16/10] w-full object-cover"
                loading="lazy"
              />
            </a>
          </CardContent>
        </Card>
      ) : null}

      <DrLineLabel points={chartPoints} />

      {lookupError ? (
        <Card>
          <CardHeader>
            <CardTitle>DR Lookup Status</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">{lookupError}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Site Metadata</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Title</p>
            <p className="text-sm leading-6 text-muted-foreground">{pageSiteTitle}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Meta Description</p>
            <p className="text-sm leading-6 text-muted-foreground">{pageDescription}</p>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
