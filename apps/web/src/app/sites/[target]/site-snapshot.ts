import {
  getClaim,
  getDrChecks,
  recordDrCheck,
  recordDrHistoryChecks,
  setClaimSiteMetadata,
  upsertClaim
} from '@/db'
import { readNumberEnv } from '@/lib/env'
import { fetchDomainRating, fetchDomainRatingHistory } from '@/server/dr-providers.mjs'
import { checkRateLimit } from '@/server/rate-limit.mjs'
import { resolveSitePresentation } from '@/server/site-presentation.mjs'
import { isSpamSite } from '@/server/site-spam.mjs'

// First visits to unknown domains trigger paid Ahrefs lookups, so cap them per client and globally.
const NEW_SITE_LOOKUP_LIMITED_MESSAGE =
  'Too many new site lookups right now. Please try again later.'
const NEW_SITE_LOOKUP_UNAVAILABLE_MESSAGE =
  'New site lookups are unavailable right now. Please try again shortly.'

/** Null when a new lookup may go ahead, else the message to show instead. */
async function newSiteLookupRefusal(rateLimitKey: string) {
  const perClient = await checkRateLimit({
    key: rateLimitKey,
    points: readNumberEnv('NEW_SITE_LOOKUP_RATE_LIMIT_POINTS', 10),
    duration: readNumberEnv('NEW_SITE_LOOKUP_RATE_LIMIT_DURATION', 3600)
  })
  if (perClient.unavailable) return NEW_SITE_LOOKUP_UNAVAILABLE_MESSAGE
  if (!perClient.allowed) return NEW_SITE_LOOKUP_LIMITED_MESSAGE

  const global = await checkRateLimit({
    key: 'new-site-lookup:global',
    points: readNumberEnv('NEW_SITE_LOOKUP_DAILY_LIMIT', 100),
    duration: 24 * 60 * 60
  })
  if (global.unavailable) return NEW_SITE_LOOKUP_UNAVAILABLE_MESSAGE
  return global.allowed ? null : NEW_SITE_LOOKUP_LIMITED_MESSAGE
}

type ChartPoint = {
  checkedAt: string
  domainRating: number
}

type SiteSnapshot = {
  chartPoints: ChartPoint[]
  domainRating: number | null
  lastCheckedAt: string | null
  claimEmail: string | null
  siteTitle: string | null
  metaDescription: string | null
  siteUrl: string | null
  screenshotUrl: string | null
  lookupError: string | null
}

type StoredCheck = {
  checked_at?: string | Date | null
  domain_rating?: number | string | null
}

function clampDomainRating(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.min(100, Math.floor(parsed)))
}

function chartPointsFromChecks(checks: StoredCheck[]): ChartPoint[] {
  return checks
    .map(row => {
      const rating = clampDomainRating(row.domain_rating)
      if (rating === null) return null

      const date = new Date(row.checked_at ?? '')
      const ts = date.getTime()
      if (!Number.isFinite(ts)) return null

      return {
        ts,
        checkedAt: date.toISOString(),
        domainRating: rating
      }
    })
    .filter((row): row is ChartPoint & { ts: number } => row !== null)
    .sort((a, b) => a.ts - b.ts)
    .slice(-24)
    .map(({ checkedAt, domainRating }) => ({ checkedAt, domainRating }))
}

export async function loadSiteSnapshot(
  domain: string,
  { rateLimitKey = 'new-site-lookup:unknown' }: { rateLimitKey?: string } = {}
): Promise<SiteSnapshot> {
  const [checks, claim] = await Promise.all([getDrChecks(domain, { limit: 365 }), getClaim(domain)])
  const storedChartPoints = chartPointsFromChecks(checks)

  let domainRating = claim ? clampDomainRating(claim.domain_rating) : null
  let lastCheckedAt: Date | null = null

  if (storedChartPoints.length > 0) {
    const last = storedChartPoints[storedChartPoints.length - 1]
    const lastValue = clampDomainRating(last?.domainRating)
    if (domainRating === null && lastValue !== null) {
      domainRating = lastValue
    }
    if (last?.checkedAt) {
      lastCheckedAt = new Date(last.checkedAt)
    }
  } else if (domainRating !== null && claim?.updated_at) {
    lastCheckedAt = new Date(claim.updated_at)
  }

  let chartPoints =
    storedChartPoints.length > 0
      ? storedChartPoints
      : domainRating !== null
        ? [
            {
              checkedAt: (lastCheckedAt || new Date()).toISOString(),
              domainRating
            }
          ]
        : []

  let siteTitle = claim?.site_title ?? null
  let metaDescription = claim?.meta_description ?? null
  let siteUrl = claim?.site_url ?? null
  let screenshotUrl = claim?.screenshot_url ?? null
  let lookupError: string | null = null

  // A domain with no stored DR is a new lookup: its metadata fetch and its DR lookup both count
  // against the new-lookup caps, and a stored spam title skips both.
  const isNewSite = domainRating === null
  const storedSpam = isSpamSite({ domain, siteTitle })
  let canFetch = !storedSpam
  const refusal = canFetch && isNewSite ? await newSiteLookupRefusal(rateLimitKey) : null
  if (refusal) {
    canFetch = false
    lookupError = refusal
  }

  if (canFetch && (!siteTitle || !metaDescription || !siteUrl)) {
    try {
      const resolved = await resolveSitePresentation(domain)
      const persisted = await setClaimSiteMetadata({
        domain,
        siteTitle: resolved.siteTitle ?? null,
        metaDescription: resolved.metaDescription ?? null,
        siteUrl: resolved.siteUrl ?? null,
        screenshotUrl: resolved.screenshotUrl ?? null
      })

      siteTitle = persisted?.site_title ?? resolved.siteTitle ?? siteTitle
      metaDescription = persisted?.meta_description ?? resolved.metaDescription ?? metaDescription
      siteUrl = persisted?.site_url ?? resolved.siteUrl ?? siteUrl
      screenshotUrl = persisted?.screenshot_url ?? resolved.screenshotUrl ?? screenshotUrl
    } catch {
      // Metadata enrichment is best-effort. The page can still render from DR data alone.
    }
  }

  // Resolve the title before the lookup, so a site caught only by its spam title never costs one.
  if (canFetch && isNewSite && !isSpamSite({ domain, siteTitle })) {
    try {
      const result = await fetchDomainRating({ target: domain })
      if (!(result as { captchaRequired?: boolean })?.captchaRequired) {
        const provider = (result as { provider?: string | null })?.provider ?? null
        const fetchedRating = clampDomainRating(
          (result as { domainRating?: number | null })?.domainRating
        )
        if (fetchedRating !== null) {
          const updated = await upsertClaim({ domain, domainRating: fetchedRating, provider })
          const checkedAt = updated?.updated_at ? new Date(updated.updated_at) : new Date()
          await recordDrCheck({ domain, domainRating: fetchedRating, provider, checkedAt })
          domainRating = fetchedRating
          lastCheckedAt = checkedAt
          chartPoints = [
            {
              checkedAt: checkedAt.toISOString(),
              domainRating: fetchedRating
            }
          ]
          // History import is a second paid call; only spend it on claimed domains.
          const isAhrefs =
            provider === 'ahrefs' ||
            provider === 'ahrefs-api' ||
            Boolean(process.env.AHREFS_API_KEY)
          if (claim?.email && isAhrefs) {
            try {
              const history = await fetchDomainRatingHistory({ target: domain })
              const recorded = await recordDrHistoryChecks({
                domain,
                provider: (history as any)?.provider ?? 'ahrefs-history',
                points: Array.isArray((history as any)?.points) ? (history as any).points : []
              })
              chartPoints = chartPointsFromChecks([
                ...recorded,
                {
                  checked_at: checkedAt,
                  domain_rating: fetchedRating
                }
              ])
            } catch {
              // Historical Ahrefs import is best-effort; the current DR is enough to render.
            }
          }
        }
      }
    } catch (error) {
      // Provider errors can name internal env vars; log them server-side only.
      console.error('DR lookup failed', {
        domain,
        error: error instanceof Error ? error.message : error
      })
    }
  }

  return {
    chartPoints,
    domainRating,
    lastCheckedAt:
      lastCheckedAt && Number.isFinite(lastCheckedAt.getTime())
        ? lastCheckedAt.toISOString()
        : null,
    claimEmail: claim?.email ?? null,
    siteTitle,
    metaDescription,
    siteUrl,
    screenshotUrl,
    lookupError
  }
}
