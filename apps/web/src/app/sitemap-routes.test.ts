// The robots and sitemap route handlers, with configuration and data stubbed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const listSitemapSites = vi.hoisted(() => vi.fn())

vi.mock('@/db', () => ({ listSitemapSites }))
vi.mock('@/lib/sitemap', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/sitemap')>()),
  SITEMAP_URL_LIMIT: 2
}))

beforeEach(() => {
  vi.stubEnv('DR_PUBLIC_BASE_URL', 'https://dr.serp.co')
  listSitemapSites.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('sitemap routes', () => {
  it('serves robots.txt for the environment in SITE_ENV', async () => {
    const { GET } = await import('./robots.txt/route')

    vi.stubEnv('SITE_ENV', 'production')
    const production = GET()
    expect(production.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(await production.text()).toContain('Sitemap: https://dr.serp.co/sitemap-index.xml')

    vi.stubEnv('SITE_ENV', 'staging')
    expect(await GET().text()).toBe('User-agent: *\nDisallow: /\n')
  })

  it('serves the index at both /sitemap-index.xml and /sitemap.xml', async () => {
    const index = await (await import('./sitemap-index.xml/route')).GET().text()
    const alias = await (await import('./sitemap.xml/route')).GET().text()

    expect(alias).toBe(index)
    expect(index).toContain('<loc>https://dr.serp.co/sitemap-sites.xml</loc>')
  })

  it("lists each listable site's page, capped at one file's limit", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    listSitemapSites.mockResolvedValue([
      { domain: 'a.com', updated_at: '2026-10-01T00:00:00.000Z' },
      { domain: 'b.com', updated_at: null },
      { domain: 'c.com', updated_at: null }
    ])
    const response = await (await import('./sitemap-sites.xml/route')).GET()
    const xml = await response.text()

    expect(response.headers.get('content-type')).toBe('application/xml; charset=utf-8')
    expect(xml).toContain(
      '<url><loc>https://dr.serp.co/sites/a.com</loc><lastmod>2026-10-01T00:00:00.000Z</lastmod></url>'
    )
    expect(xml).toContain('<url><loc>https://dr.serp.co/sites/b.com</loc></url>')
    expect(xml).not.toContain('c.com')
    expect(console.error).toHaveBeenCalled()
  })

  it('lists the static pages', async () => {
    const xml = await (await import('./sitemap-pages.xml/route')).GET().text()

    expect(xml).toContain('<url><loc>https://dr.serp.co</loc></url>')
    expect(xml).toContain('<url><loc>https://dr.serp.co/pricing</loc></url>')
  })
})
