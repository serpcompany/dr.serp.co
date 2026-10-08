import { getPublicBaseUrl } from '@/lib/public-url'
import { sitemapIndex } from '@/lib/sitemap'
import { xmlResponse } from '@/lib/sitemap-response'

export const dynamic = 'force-dynamic'

export function GET() {
  return xmlResponse(sitemapIndex(getPublicBaseUrl()))
}
