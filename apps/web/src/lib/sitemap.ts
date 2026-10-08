// robots.txt and the sitemaps, built from one list of the site's pages. Standards:
// websites/features/xml-sitemaps.md and environment-configuration.md in serpcompany/serp.
// URLs have no trailing slash (AGENTS.md, Exceptions); the homepage is the bare origin.
import { isProductionSite } from '@/lib/site-env'

// The pages search engines should know about, besides each site's /sites/<domain> page. /sites is
// left out: it renders the same listing as the homepage.
export const SITEMAP_PAGES = ['/', '/pricing', '/add'] as const

// The child sitemaps, by content group, in the order the index lists them.
export const SITEMAP_GROUPS = ['pages', 'sites'] as const

export type SitemapEntry = { path: string; lastModified?: string | null }

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>'
const NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9'

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

// The absolute URL for a path: the homepage is the origin itself, every other path is appended.
export function pageUrl(baseUrl: string, path: string) {
  const origin = baseUrl.replace(/\/+$/, '')
  return path === '/' ? origin : `${origin}${path}`
}

export function sitemapUrlset(baseUrl: string, entries: SitemapEntry[]) {
  const urls = entries.map(entry => {
    const lastmod = entry.lastModified ? `<lastmod>${escapeXml(entry.lastModified)}</lastmod>` : ''
    return `<url><loc>${escapeXml(pageUrl(baseUrl, entry.path))}</loc>${lastmod}</url>`
  })
  return `${XML_HEADER}\n<urlset xmlns="${NAMESPACE}">\n${urls.join('\n')}\n</urlset>\n`
}

export function sitemapIndex(baseUrl: string) {
  const sitemaps = SITEMAP_GROUPS.map(
    group => `<sitemap><loc>${escapeXml(pageUrl(baseUrl, `/sitemap-${group}.xml`))}</loc></sitemap>`
  )
  return `${XML_HEADER}\n<sitemapindex xmlns="${NAMESPACE}">\n${sitemaps.join('\n')}\n</sitemapindex>\n`
}

// Production lets crawlers in and points them at the sitemap index; every other environment,
// including one with SITE_ENV missing, shuts them out.
export function robotsTxt(baseUrl: string, siteEnv: string | undefined) {
  if (!isProductionSite(siteEnv)) return 'User-agent: *\nDisallow: /\n'
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /billing',
    '',
    `Sitemap: ${pageUrl(baseUrl, '/sitemap-index.xml')}`,
    ''
  ].join('\n')
}

// A sitemap file holds at most 50,000 URLs (xml-sitemaps.md, When a Group Overflows).
export const SITEMAP_URL_LIMIT = 50000

// Sitemaps and robots.txt change as sites are added, so caches keep them for an hour.
export const SITEMAP_CACHE_CONTROL = 'public, max-age=3600'
