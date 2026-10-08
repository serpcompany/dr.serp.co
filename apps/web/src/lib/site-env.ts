// Which deployed environment this is, from the SITE_ENV var. Anything other than an explicit
// "production", including a missing value, counts as non-production (environment-configuration.md,
// Safe defaults), so a misconfigured Worker hides from search engines rather than duplicating
// dr.serp.co.
export function isProductionSite(siteEnv: string | undefined) {
  return siteEnv === 'production'
}

// Outside Production every response tells search engines not to index it. #45 adds robots.txt.
export function withRobotsHeader(response: Response, siteEnv: string | undefined): Response {
  if (isProductionSite(siteEnv)) return response
  const headers = new Headers(response.headers)
  headers.set('X-Robots-Tag', 'noindex')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}
