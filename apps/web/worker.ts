// The Worker entry: answers the edge redirects, runs Next.js through OpenNext, then applies the
// cache header rule and, outside Production, noindex. Each concern lives in src/lib with its tests (docs/architecture.md).
// `open-next-worker` is .open-next/worker.js, aliased in wrangler.jsonc so the type checker never
// loads the build output (open-next-worker.d.ts declares it).
import openNext from 'open-next-worker'

import { applyCacheControlParity } from './src/lib/cache-control-parity'
import { edgeRedirect } from './src/lib/edge-redirect'
import { withRobotsHeader } from './src/lib/site-env'

export { RateLimitDurableObject } from './src/server/rate-limit-do.mjs'

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    const redirect = edgeRedirect(request, env.DR_PUBLIC_BASE_URL)
    if (redirect) return withRobotsHeader(redirect, env.SITE_ENV)

    const response = await openNext.fetch(request, env, ctx)
    return withRobotsHeader(applyCacheControlParity(request, response), env.SITE_ENV)
  }
} satisfies ExportedHandler<CloudflareEnv>
