import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Lint is Biome (`pnpm lint`). Next.js 15 would otherwise look for ESLint during builds; Next.js
  // 16 (#47) drops build-time linting, and this setting with it.
  eslint: {
    ignoreDuringBuilds: true
  }
}

export default nextConfig
