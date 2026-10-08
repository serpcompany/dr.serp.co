import { getPublicBaseUrl } from '@/lib/public-url'
import { SITEMAP_PAGES, sitemapUrlset } from '@/lib/sitemap'
import { xmlResponse } from '@/lib/sitemap-response'

export const dynamic = 'force-dynamic'

export function GET() {
  return xmlResponse(
    sitemapUrlset(
      getPublicBaseUrl(),
      SITEMAP_PAGES.map(path => ({ path }))
    )
  )
}
