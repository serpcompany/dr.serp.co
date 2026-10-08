import { getPublicBaseUrl } from '@/lib/public-url'
import { robotsTxt, SITEMAP_CACHE_CONTROL } from '@/lib/sitemap'

export const dynamic = 'force-dynamic'

export function GET() {
  return new Response(robotsTxt(getPublicBaseUrl(), process.env.SITE_ENV), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': SITEMAP_CACHE_CONTROL }
  })
}
