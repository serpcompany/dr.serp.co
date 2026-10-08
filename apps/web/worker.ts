// The Worker entry: answers the edge redirects, runs Next.js through OpenNext, then applies the
// cache header rule. Each concern lives in src/lib with its tests (docs/architecture.md).
// `open-next-worker` is .open-next/worker.js, aliased in wrangler.jsonc so the type checker never
// loads the build output (open-next-worker.d.ts declares it).
import openNext from 'open-next-worker'

import { applyCacheControlParity } from './src/lib/cache-control-parity'
import { edgeRedirect } from './src/lib/edge-redirect'

export { RateLimitDurableObject } from './src/server/rate-limit-do.mjs'

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    const redirect = edgeRedirect(request, env.DR_PUBLIC_BASE_URL)
    if (redirect) return redirect

    const response = await openNext.fetch(request, env, ctx)
    return applyCacheControlParity(request, response)
  }
} satisfies ExportedHandler<CloudflareEnv>
