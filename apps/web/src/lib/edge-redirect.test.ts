import { describe, expect, it } from 'vitest'

import { edgeRedirect, SMOKE_TEST_HEADER } from './edge-redirect'

const PRODUCTION = 'https://dr.serp.co'

function redirect(url: string, init?: RequestInit, base: string | undefined = PRODUCTION) {
  return edgeRedirect(new Request(url, init), base)
}

describe('edgeRedirect', () => {
  it('drops a trailing slash on the same host', async () => {
    const response = redirect('https://dr.serp.co/api/sites/?limit=1')

    expect(response?.status).toBe(308)
    expect(response?.headers.get('location')).toBe('/api/sites?limit=1')
    expect(response?.headers.get('content-type')).toBe('text/plain')
    expect(response?.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate')
    await expect(response?.text()).resolves.toBe('Redirecting...\n')
  })

  it('passes through the root, slashless paths and Next.js assets', () => {
    expect(redirect('https://dr.serp.co/')).toBeNull()
    expect(redirect('https://dr.serp.co/api/sites')).toBeNull()
    expect(redirect('https://dr.serp.co/_next/static/chunk.js/')).toBeNull()
  })

  it('sends a workers.dev request to the canonical host', () => {
    const response = redirect('https://serp-dr.serpcompany.workers.dev/sites/example.com?x=1')

    expect(response?.status).toBe(308)
    expect(response?.headers.get('location')).toBe('https://dr.serp.co/sites/example.com?x=1')
  })

  it('moves host and drops the slash in one hop', () => {
    const response = redirect('https://serp-dr.serpcompany.workers.dev/sites/', { method: 'POST' })

    expect(response?.status).toBe(308)
    expect(response?.headers.get('location')).toBe('https://dr.serp.co/sites')
  })

  it('sends a preview URL to the canonical host too', () => {
    const response = redirect(
      'https://abc123-serp-dr-preview.serpcompany.workers.dev/',
      undefined,
      'https://staging-dr.serp.co'
    )

    expect(response?.headers.get('location')).toBe('https://staging-dr.serp.co/')
  })

  it('lets a request with the smoke-test header through on workers.dev', () => {
    const headers = { [SMOKE_TEST_HEADER]: '1' }

    expect(redirect('https://serp-dr.serpcompany.workers.dev/sites', { headers })).toBeNull()
    // The slash rule still applies, on the same host.
    expect(
      redirect('https://serp-dr.serpcompany.workers.dev/sites/', { headers })?.headers.get(
        'location'
      )
    ).toBe('/sites')
  })

  it('leaves branded and local hosts alone, and does nothing without a valid canonical URL', () => {
    expect(redirect('https://staging-dr.serp.co/sites')).toBeNull()
    expect(redirect('http://localhost:8791/sites')).toBeNull()
    expect(
      edgeRedirect(new Request('https://serp-dr.serpcompany.workers.dev/sites'), undefined)
    ).toBeNull()
    expect(
      redirect('https://serp-dr.serpcompany.workers.dev/sites', undefined, 'not a url')
    ).toBeNull()
    expect(
      redirect(
        'https://serp-dr.serpcompany.workers.dev/sites',
        undefined,
        'https://serp-dr.serpcompany.workers.dev'
      )
    ).toBeNull()
  })
})
