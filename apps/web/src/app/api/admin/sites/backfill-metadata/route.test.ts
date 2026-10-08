import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const countSites = vi.fn()
const listSites = vi.fn()
const setClaimSiteMetadata = vi.fn()
const resolveSitePresentation = vi.fn()

vi.mock('@/server/db.mjs', () => ({
  countSites,
  listSites,
  setClaimSiteMetadata
}))

vi.mock('@/server/site-presentation.mjs', () => ({
  resolveSitePresentation
}))

const envBackup = { ...process.env }

function restoreEnv() {
  for (const key of Object.keys(process.env)) delete process.env[key]
  Object.assign(process.env, envBackup)
}

describe('POST /api/admin/sites/backfill-metadata', () => {
  beforeEach(() => {
    countSites.mockReset()
    listSites.mockReset()
    setClaimSiteMetadata.mockReset()
    resolveSitePresentation.mockReset()
    process.env.DR_ADMIN_TOKEN = 'admin-secret'
  })

  afterEach(() => {
    restoreEnv()
  })

  it('requires the admin token', async () => {
    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/admin/sites/backfill-metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload.error).toBe('Unauthorized.')
    expect(listSites).not.toHaveBeenCalled()
  })

  it('reports candidates in dry-run mode', async () => {
    countSites.mockResolvedValue(2)
    listSites.mockResolvedValue([
      {
        domain: 'missing.example',
        site_title: null,
        meta_description: null,
        site_url: null,
        screenshot_url: null
      },
      {
        domain: 'ready.example',
        site_title: 'Ready',
        meta_description: null,
        site_url: null,
        screenshot_url: null
      }
    ])

    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/admin/sites/backfill-metadata', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': 'admin-secret'
      },
      body: JSON.stringify({ limit: 10, offset: 0 })
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(payload.dryRun).toBe(true)
    expect(payload.candidates).toBe(1)
    expect(payload.skipped).toBe(1)
    expect(payload.results).toEqual([{ domain: 'missing.example', status: 'pending' }])
    expect(resolveSitePresentation).not.toHaveBeenCalled()
    expect(setClaimSiteMetadata).not.toHaveBeenCalled()
  })

  it('updates missing metadata when dryRun is false', async () => {
    countSites.mockResolvedValue(1)
    listSites.mockResolvedValue([
      {
        domain: 'missing.example',
        site_title: null,
        meta_description: null,
        site_url: null,
        screenshot_url: null
      }
    ])
    resolveSitePresentation.mockResolvedValue({
      siteTitle: 'Missing',
      metaDescription: 'Resolved',
      siteUrl: 'https://missing.example',
      screenshotUrl: null,
      source: 'homepage'
    })

    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/admin/sites/backfill-metadata', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': 'admin-secret'
      },
      body: JSON.stringify({ dryRun: false })
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.updated).toBe(1)
    expect(setClaimSiteMetadata).toHaveBeenCalledWith({
      domain: 'missing.example',
      siteTitle: 'Missing',
      metaDescription: 'Resolved',
      siteUrl: 'https://missing.example',
      screenshotUrl: null
    })
  })

  it('logs a failed lookup and returns a fixed message', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    countSites.mockResolvedValue(1)
    listSites.mockResolvedValue([{ domain: 'missing.example' }])
    const lookupError = new Error('Microlink 401: MICROLINK_API_KEY is invalid')
    resolveSitePresentation.mockRejectedValue(lookupError)

    const { POST } = await import('./route')
    const response = await POST(
      new Request('http://localhost/api/admin/sites/backfill-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': 'admin-secret' },
        body: JSON.stringify({ dryRun: false })
      })
    )
    const payload = await response.json()

    expect(JSON.stringify(payload)).not.toContain('MICROLINK_API_KEY')
    expect(payload.results).toEqual([
      {
        domain: 'missing.example',
        status: 'failed',
        error: 'Metadata lookup failed; see the Worker logs.'
      }
    ])
    expect(consoleError).toHaveBeenCalledWith('admin.backfill-metadata: metadata lookup failed', {
      domain: 'missing.example',
      error: 'Microlink 401: MICROLINK_API_KEY is invalid'
    })
  })
})
