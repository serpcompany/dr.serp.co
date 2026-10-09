// Ported from best.serp.co's callback-url tests (its PR #76 review found the dot-segment bypass).
import { describe, expect, it } from 'vitest'
import {
  callbackDestination,
  DEFAULT_CALLBACK_PATH,
  loginHref,
  safeCallbackPath
} from './callback-url'

const ORIGIN = 'https://dr.serp.co'

/** Where a browser on this site would go for the returned value. */
function destination(value: string): URL {
  return new URL(safeCallbackPath(value), ORIGIN)
}

describe('the sign-in callback', () => {
  it('keeps paths on this site, with their query and fragment', () => {
    expect(safeCallbackPath('/billing')).toBe('/billing')
    expect(safeCallbackPath('/sites/best.serp.co?claim=1#badge')).toBe(
      '/sites/best.serp.co?claim=1#badge'
    )
    expect(safeCallbackPath(['/billing', '/pricing'])).toBe('/billing')
    // Dot segments that stay on the site resolve normally.
    expect(safeCallbackPath('/sites/./x/../best.serp.co')).toBe('/sites/best.serp.co')
  })

  it('never redirects off-site or back to /login', () => {
    for (const value of [
      undefined,
      null,
      '',
      'https://evil.example/',
      'https://evil.example',
      '//evil.example/',
      '/\\evil.example/',
      '\\\\evil.example',
      '\\evil.example',
      'javascript:alert(1)',
      'javascript://%0aalert(1)',
      ' /billing',
      '/\nevil',
      '/\tevil',
      '/login/',
      '/login',
      '/LOGIN/?callbackUrl=/billing'
    ]) {
      expect(safeCallbackPath(value), String(value)).toBe(DEFAULT_CALLBACK_PATH)
    }
  })

  // PR #76 review, finding 1: values that normalize to a protocol-relative `//host` path.
  it('rejects paths that only become another host after normalization', () => {
    for (const value of [
      '/.//evil.example/',
      '/.//evil.example/phish',
      '/%2e//evil.example/',
      '/%2E//evil.example/',
      '/x/..//evil.example/',
      '/x/%2e%2e//evil.example/',
      '/a/../..//evil.example',
      '/./..//evil.example',
      '/%2e%2e//evil.example'
    ]) {
      expect(safeCallbackPath(value), value).toBe(DEFAULT_CALLBACK_PATH)
    }
  })

  it('keeps every other value on this site, encoded or not', () => {
    for (const value of [
      '/%2f%2fevil.example/',
      '/%2F%2Fevil.example',
      '/%5cevil.example',
      '/%5C%5Cevil.example',
      '/%252e//evil.example/',
      '/.%2fevil.example',
      '/?next=//evil.example',
      '/#//evil.example',
      '/sites/%2e%2e%2f%2fevil.example'
    ]) {
      const result = safeCallbackPath(value)
      expect(result.startsWith('//'), value).toBe(false)
      expect(result.includes('\\'), value).toBe(false)
      expect(destination(value).origin, value).toBe(ORIGIN)
    }
  })

  it('resolves against the origin it is given', () => {
    expect(safeCallbackPath('/.//evil.example/', 'http://127.0.0.1:3100')).toBe(
      DEFAULT_CALLBACK_PATH
    )
    expect(safeCallbackPath('/about/', 'http://127.0.0.1:3100')).toBe('/about/')
  })

  it('names the destination on the signed-in screen', () => {
    expect(callbackDestination('/account/sites?site=x.com')).toEqual({
      button: 'Continue to your account',
      sentence: 'Taking you to your account.'
    })
    expect(callbackDestination('/account/billing?plan=25').button).toBe('Continue to billing')
    expect(callbackDestination('/sites/x.com').button).toBe('Continue')
  })

  it('links to /login with the way back, and none for the default', () => {
    expect(loginHref('/account')).toBe('/login')
    expect(loginHref('/sites/x.com?claim=1')).toBe(
      '/login?callbackUrl=%2Fsites%2Fx.com%3Fclaim%3D1'
    )
    expect(safeCallbackPath(decodeURIComponent(loginHref('/billing').split('=')[1] ?? ''))).toBe(
      '/billing'
    )
  })
})
