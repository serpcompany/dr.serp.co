import { describe, expect, it } from 'vitest'

import { applyCacheControlParity } from './cache-control-parity.mjs'

describe('applyCacheControlParity', () => {
  it('adds parity cache-control to GET responses without one', () => {
    const response = applyCacheControlParity(
      new Request('https://dr.serp.co/api/sites'),
      new Response('{}', { headers: { 'Content-Type': 'application/json' } })
    )

    expect(response.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate')
    expect(response.headers.get('content-type')).toBe('application/json')
  })

  it('replaces OpenNext static cache-control on app pages', () => {
    const response = applyCacheControlParity(
      new Request('https://dr.serp.co/pricing'),
      new Response('<html></html>', { headers: { 'Cache-Control': 's-maxage=31536000' } })
    )

    expect(response.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate')
  })

  it('preserves explicit dynamic cache-control and cookie responses', () => {
    const dynamicResponse = new Response('dynamic', {
      headers: { 'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate' }
    })
    expect(applyCacheControlParity(new Request('https://dr.serp.co/sites'), dynamicResponse)).toBe(
      dynamicResponse
    )

    const cookieResponse = new Response('cookie', { headers: { 'Set-Cookie': 'session=1' } })
    expect(
      applyCacheControlParity(new Request('https://dr.serp.co/api/auth'), cookieResponse)
    ).toBe(cookieResponse)
  })

  it('skips non-GET requests and Next assets', () => {
    const postResponse = new Response('post')
    expect(
      applyCacheControlParity(
        new Request('https://dr.serp.co/api/sites', { method: 'POST' }),
        postResponse
      )
    ).toBe(postResponse)

    const assetResponse = new Response('asset', {
      headers: { 'Cache-Control': 's-maxage=31536000' }
    })
    expect(
      applyCacheControlParity(new Request('https://dr.serp.co/_next/static/app.js'), assetResponse)
    ).toBe(assetResponse)
  })

  it('does not make token-gated admin responses publicly cacheable', () => {
    const response = new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' }
    })

    expect(
      applyCacheControlParity(new Request('https://dr.serp.co/api/admin/subscriptions'), response)
    ).toBe(response)
  })

  it('does not make server errors publicly cacheable', () => {
    const response = new Response('error', { status: 500 })

    expect(applyCacheControlParity(new Request('https://dr.serp.co/api/sites'), response)).toBe(
      response
    )
  })
})
