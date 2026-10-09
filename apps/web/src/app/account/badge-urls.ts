import 'server-only'

import type { BadgeUrls } from '@/components/account/sites-table'
import { getPublicBaseUrl } from '@/lib/public-url'

/** The site's origin and the badge host, as the public site page uses them. */
export function badgeUrls(): BadgeUrls {
  const site = getPublicBaseUrl()
  return { site, badge: process.env.DR_BADGE_BASE_URL || site }
}
