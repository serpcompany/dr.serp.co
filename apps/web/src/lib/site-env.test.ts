import { describe, expect, it } from 'vitest'

import { isProductionSite, withRobotsHeader } from './site-env'

describe('site environment', () => {
  it('counts only an explicit "production" as Production', () => {
    expect(isProductionSite('production')).toBe(true)
    for (const value of ['staging', 'local', 'Production', '', undefined]) {
      expect(isProductionSite(value)).toBe(false)
    }
  })

  it('sends noindex outside Production and leaves Production untouched', async () => {
    const page = () =>
      new Response('<p>hi</p>', { status: 201, headers: { 'Content-Type': 'text/html' } })

    const staging = withRobotsHeader(page(), 'staging')
    expect(staging.headers.get('x-robots-tag')).toBe('noindex')
    expect(staging.status).toBe(201)
    expect(staging.headers.get('content-type')).toBe('text/html')
    await expect(staging.text()).resolves.toBe('<p>hi</p>')

    expect(withRobotsHeader(page(), undefined).headers.get('x-robots-tag')).toBe('noindex')
    expect(withRobotsHeader(page(), 'production').headers.has('x-robots-tag')).toBe(false)
  })
})
