import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {}

export default nextConfig

// `next dev` gets the local bindings from wrangler.jsonc's top level (local D1 in .wrangler/), so
// development runs on D1 like every other environment. It does nothing outside `next dev`.
initOpenNextCloudflareForDev()
