import { NextResponse } from 'next/server'
import { checkAdminToken } from '@/server/admin-auth.mjs'
import { countSites, listSites, setClaimSiteMetadata } from '@/server/db.mjs'
import { resolveSitePresentation } from '@/server/site-presentation.mjs'
import { readWriteRequest } from '@/server/write-route'
import { BackfillBody } from '@/server/write-schemas'

export const runtime = 'nodejs'

type SiteRow = {
  domain: string
  site_title?: unknown
  meta_description?: unknown
  site_url?: unknown
  screenshot_url?: unknown
}

type BackfillResult =
  | { domain: string; status: 'pending' }
  | { domain: string; status: 'updated'; source: string; screenshot: boolean }
  | { domain: string; status: 'failed'; error: string }

function asInt(value: unknown, fallback: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(1, Math.min(max, parsed))
}

function asOffset(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function hasPresentationMetadata(site: SiteRow) {
  return Boolean(site.site_title || site.meta_description || site.site_url || site.screenshot_url)
}

export async function POST(request: Request) {
  const denied = checkAdminToken(request)
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status })

  // Operator scripts call admin routes with a token, not a browser cookie, so no Origin check.
  const read = await readWriteRequest(request, BackfillBody, { checkOrigin: false })
  if (!read.ok) return read.response
  const body = read.data
  const dryRun = body?.dryRun !== false
  const limit = asInt(body?.limit, 25, 100)
  const offset = asOffset(body?.offset)
  const query = typeof body?.query === 'string' ? body.query.trim() : ''

  const [total, siteRows] = await Promise.all([
    countSites({ query }),
    listSites({ query, limit, offset, sort: 'updated' })
  ])
  const sites = siteRows as SiteRow[]

  const candidates = sites.filter(site => !hasPresentationMetadata(site))
  const results: BackfillResult[] = []

  for (const site of candidates) {
    if (dryRun) {
      results.push({ domain: site.domain, status: 'pending' })
      continue
    }

    try {
      const resolved = await resolveSitePresentation(site.domain)
      await setClaimSiteMetadata({
        domain: site.domain,
        siteTitle: resolved.siteTitle ?? null,
        metaDescription: resolved.metaDescription ?? null,
        siteUrl: resolved.siteUrl ?? null,
        screenshotUrl: resolved.screenshotUrl ?? null
      })
      results.push({
        domain: site.domain,
        status: 'updated',
        source: String(resolved.source ?? 'unknown'),
        screenshot: Boolean(resolved.screenshotUrl)
      })
    } catch (error) {
      // Log the message itself: a nested Error object can reach the Worker logs as {}.
      console.error('admin.backfill-metadata: metadata lookup failed', {
        domain: site.domain,
        error: error instanceof Error ? error.message : String(error)
      })
      results.push({
        domain: site.domain,
        status: 'failed',
        error: 'Metadata lookup failed; see the Worker logs.'
      })
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    total,
    limit,
    offset,
    scanned: sites.length,
    candidates: candidates.length,
    skipped: sites.length - candidates.length,
    updated: results.filter(entry => entry.status === 'updated').length,
    failed: results.filter(entry => entry.status === 'failed').length,
    hasMore: offset + sites.length < total,
    results
  })
}
