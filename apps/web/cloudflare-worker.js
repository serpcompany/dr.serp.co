import handler from './.open-next/worker.js'
import { applyCacheControlParity } from './src/server/cache-control-parity.mjs'
import { RateLimitDurableObject } from './src/server/rate-limit-do.mjs'
import { redirectTrailingSlash } from './src/server/trailing-slash-redirect.mjs'

export { RateLimitDurableObject }

export default {
  async fetch(request, env, ctx) {
    const redirect = redirectTrailingSlash(request)
    if (redirect) return redirect

    const response = await handler.fetch(request, env, ctx)
    return applyCacheControlParity(request, response)
  }
}
