// The add-site lookup: signed in only, valid and non-spam domains only, the site page's own
// loader (so its caps apply), and an owner relative to the signed-in email.
import { afterEach, describe, expect, it, vi } from 'vitest'

const loadSiteSnapshot = vi.hoisted(() => vi.fn())

vi.mock('@/app/sites/[target]/site-snapshot', () => ({ loadSiteSnapshot }))
vi.mock('@/server/auth/session', () => ({
  getSessionEmail: async (request: { headers: Headers }) =>
    request.headers.get('cookie')?.match(/(?:^|; )test-session=([^;]+)/)?.[1] ?? null
}))
vi.mock('@/lib/public-url', () => ({ getPublicBaseUrl: () => 'https://dr.serp.co' }))

const { POST } = await import('./route')

function lookup(domain: unknown, { email = 'owner@example.com' as string | null } = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Origin: 'https://dr.serp.co',
    'cf-connecting-ip': '203.0.113.9'
  }
  if (email) headers.cookie = `test-session=${email}`
  return POST(
    new Request('https://dr.serp.co/api/sites/lookup', {
      method: 'POST',
      headers,
      body: JSON.stringify({ domain })
    })
  )
}

function snapshot(patch: Record<string, unknown> = {}) {
  return {
    chartPoints: [],
    domainRating: 54,
    lastCheckedAt: null,
    claimEmail: null,
    siteTitle: 'Best',
    metaDescription: null,
    siteUrl: null,
    screenshotUrl: null,
    lookupError: null,
    ...patch
  }
}

afterEach(() => {
  loadSiteSnapshot.mockReset()
})

describe('POST /api/sites/lookup', () => {
  it('needs a session', async () => {
    const response = await lookup('best.serp.co', { email: null })
    expect(response.status).toBe(401)
    expect(loadSiteSnapshot).not.toHaveBeenCalled()
  })

  it('refuses invalid and spam domains before any lookup', async () => {
    expect((await lookup('phpinfo.php')).status).toBe(400)
    expect((await lookup('bestcasinos.com')).status).toBe(404)
    expect(loadSiteSnapshot).not.toHaveBeenCalled()
  })

  it('looks up through the site page loader, keyed for the new-lookup caps by client', async () => {
    loadSiteSnapshot.mockResolvedValue(snapshot())
    const response = await lookup('Best.Serp.co')
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toEqual({
      domain: 'best.serp.co',
      dr: 54,
      title: 'Best',
      owner: 'nobody',
      note: null
    })
    expect(loadSiteSnapshot).toHaveBeenCalledWith('best.serp.co', {
      rateLimitKey: 'new-site-lookup:203.0.113.9'
    })
  })

  it('names the owner relative to the signed-in email', async () => {
    loadSiteSnapshot.mockResolvedValue(snapshot({ claimEmail: 'Owner@Example.com' }))
    expect(((await (await lookup('best.serp.co')).json()) as { owner: string }).owner).toBe('you')
    loadSiteSnapshot.mockResolvedValue(snapshot({ claimEmail: 'other@example.com' }))
    expect(((await (await lookup('best.serp.co')).json()) as { owner: string }).owner).toBe('other')
  })

  it('passes on why no DR was looked up', async () => {
    loadSiteSnapshot.mockResolvedValue(
      snapshot({ domainRating: null, lookupError: 'New lookups are limited right now.' })
    )
    expect(await (await lookup('new.example')).json()).toMatchObject({
      dr: null,
      note: 'New lookups are limited right now.'
    })
  })

  it('hides a spam title and a failed lookup behind fixed answers', async () => {
    loadSiteSnapshot.mockResolvedValue(snapshot({ siteTitle: 'Best online casino bonus' }))
    expect((await lookup('innocent.example')).status).toBe(404)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    loadSiteSnapshot.mockRejectedValue(new Error('AHREFS_API_KEY missing'))
    const failed = await lookup('best.serp.co')
    expect(failed.status).toBe(503)
    expect(JSON.stringify(await failed.json())).not.toContain('AHREFS')
    error.mockRestore()
  })
})
