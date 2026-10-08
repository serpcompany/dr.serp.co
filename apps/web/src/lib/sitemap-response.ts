import { SITEMAP_CACHE_CONTROL } from '@/lib/sitemap'

export function xmlResponse(body: string) {
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': SITEMAP_CACHE_CONTROL
    }
  })
}
