const PARITY_CACHE_CONTROL = 'public, max-age=0, must-revalidate'
const OPEN_NEXT_STATIC_CACHE_CONTROL = 's-maxage=31536000'

function shouldSkipPath(pathname) {
  return (
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/api/admin/')
  )
}

export function applyCacheControlParity(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return response

  const url = new URL(request.url)
  if (shouldSkipPath(url.pathname)) return response
  if (response.status >= 500) return response
  if (response.headers.has('set-cookie')) return response

  const current = response.headers.get('cache-control')
  if (current && current !== OPEN_NEXT_STATIC_CACHE_CONTROL) return response

  const headers = new Headers(response.headers)
  headers.set('Cache-Control', PARITY_CACHE_CONTROL)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}
