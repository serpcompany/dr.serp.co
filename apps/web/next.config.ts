import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
import type { NextConfig } from 'next'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'

// `next dev` gets the local bindings from wrangler.jsonc's top level (local D1 in .wrangler/), so
// development runs on D1 like every other environment. Only the dev server starts that local
// workerd; `next build` would otherwise start one too and read .dev.vars on every build.
export default async function config(phase: string): Promise<NextConfig> {
  if (phase === PHASE_DEVELOPMENT_SERVER) await initOpenNextCloudflareForDev()
  return {
    // /add was the signed-in page before the account area (#142).
    async redirects() {
      return [{ source: '/add', destination: '/account/sites?add=1', permanent: true }]
    }
  }
}
