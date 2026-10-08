import { getPublicBaseUrl } from '@/lib/public-url'
import { SITEMAP_URL_LIMIT, sitemapUrlset } from '@/lib/sitemap'
import { xmlResponse } from '@/lib/sitemap-response'
import { listSitemapSites } from '@/server/db.mjs'

export const dynamic = 'force-dynamic'

// Every listable site's page. Past 50,000 sites this file is full, and the sites group needs a
// second file (xml-sitemaps.md, When a Group Overflows); the log says when that happens.
export async function GET() {
  const sites = await listSitemapSites()
  if (sites.length > SITEMAP_URL_LIMIT) {
    console.error(`sitemap: ${sites.length} sites exceed one file; add /sitemap-sites-2.xml`)
  }
  return xmlResponse(
    sitemapUrlset(
      getPublicBaseUrl(),
      sites.slice(0, SITEMAP_URL_LIMIT).map(site => ({
        path: `/sites/${encodeURIComponent(site.domain)}`,
        lastModified: site.updated_at
      }))
    )
  )
}
