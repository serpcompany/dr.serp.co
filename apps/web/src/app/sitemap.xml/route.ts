// A compatibility alias: the same content as /sitemap-index.xml, the real entry point.
import { GET as sitemapIndexGet } from '../sitemap-index.xml/route'

export const dynamic = 'force-dynamic'

export function GET() {
  return sitemapIndexGet()
}
