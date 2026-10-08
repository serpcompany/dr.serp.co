// The redirects the Worker answers before Next.js runs, combined so every request takes one hop:
// a platform host (*.workers.dev) goes to the environment's canonical host, and a path ending in
// a slash loses it. Standards: environment-configuration.md (Canonical hosts) in serpcompany/serp.

// CI reaches a deployment through its workers.dev host by sending this header; any value works.
export const SMOKE_TEST_HEADER = 'x-dr-serp-smoke-test'

const PLATFORM_HOST = /\.workers\.dev$/

// The path without its trailing slash, or null when it has none or is exempt.
export function slashlessPath(pathname: string): string | null {
  if (pathname === '/' || !pathname.endsWith('/')) return null
  if (pathname.startsWith('/_next/') || pathname === '/favicon.ico') return null
  return pathname.replace(/\/+$/, '') || '/'
}

// The canonical origin to send this request to, or null when it's already there or exempt.
export function canonicalOrigin(request: Request, canonicalBaseUrl: string | undefined) {
  const url = new URL(request.url)
  if (!PLATFORM_HOST.test(url.hostname)) return null
  if (request.headers.has(SMOKE_TEST_HEADER)) return null
  if (!canonicalBaseUrl) return null

  let canonical: URL
  try {
    canonical = new URL(canonicalBaseUrl)
  } catch {
    return null
  }
  return canonical.host === url.host ? null : canonical.origin
}

export function edgeRedirect(request: Request, canonicalBaseUrl: string | undefined) {
  const url = new URL(request.url)
  const path = slashlessPath(url.pathname)
  const origin = canonicalOrigin(request, canonicalBaseUrl)
  if (path === null && origin === null) return null

  return new Response('Redirecting...\n', {
    status: 308,
    headers: {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Content-Type': 'text/plain',
      Location: `${origin ?? ''}${path ?? url.pathname}${url.search}`
    }
  })
}
