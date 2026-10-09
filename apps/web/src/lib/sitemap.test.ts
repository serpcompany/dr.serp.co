import { describe, expect, it } from 'vitest'

import { pageUrl, robotsTxt, SITEMAP_PAGES, sitemapIndex, sitemapUrlset } from './sitemap'

const BASE = 'https://dr.serp.co'

describe('sitemaps', () => {
  it('writes the homepage as the bare origin and other pages without a trailing slash', () => {
    expect(pageUrl(`${BASE}/`, '/')).toBe(BASE)
    expect(pageUrl(BASE, '/pricing')).toBe(`${BASE}/pricing`)
    expect(SITEMAP_PAGES).toContain('/')
  })

  it('lists the child sitemaps from the site root in the index', () => {
    const xml = sitemapIndex(BASE)

    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml).toContain(`<loc>${BASE}/sitemap-pages.xml</loc>`)
    expect(xml).toContain(`<loc>${BASE}/sitemap-sites.xml</loc>`)
    expect(xml).not.toContain('sitemap-index.xml')
  })

  it('writes a URL set with lastmod when known, escaping XML', () => {
    const xml = sitemapUrlset(BASE, [
      { path: '/' },
      { path: '/sites/a&b.com', lastModified: '2026-10-05T00:00:00.000Z' }
    ])

    expect(xml).toContain(`<url><loc>${BASE}</loc></url>`)
    expect(xml).not.toContain(`<loc>${BASE}/</loc>`)
    expect(xml).toContain(
      `<url><loc>${BASE}/sites/a&amp;b.com</loc><lastmod>2026-10-05T00:00:00.000Z</lastmod></url>`
    )
  })
})

describe('robots.txt', () => {
  it('lets crawlers in on Production and points them at the sitemap index', () => {
    const robots = robotsTxt(BASE, 'production')

    expect(robots).toContain('User-agent: *\nAllow: /\n')
    expect(robots).toContain('Disallow: /api/\n')
    // The signed-in pages and sign-in itself aren't for search engines.
    expect(robots).toContain('Disallow: /account\n')
    expect(robots).toContain('Disallow: /login\n')
    expect(robots).not.toContain('Disallow: /billing')
    expect(robots).toContain(`Sitemap: ${BASE}/sitemap-index.xml\n`)
  })

  it('shuts crawlers out everywhere else, including with SITE_ENV missing', () => {
    for (const siteEnv of ['staging', 'local', undefined]) {
      expect(robotsTxt('https://staging-dr.serp.co', siteEnv)).toBe('User-agent: *\nDisallow: /\n')
    }
  })
})
