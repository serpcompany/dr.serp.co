// Which stored sites the site lists. Both rules are JavaScript (domain validation and the spam
// filter), so queries read rows and filter here; #75 tracks storing the result instead.
import { isValidDomainTarget } from '@/server/domain-target.mjs'
import { isSpamSite } from '@/server/site-spam.mjs'

type SiteRow = { domain?: string | null; site_title?: string | null; email?: string | null }

export function isListableSiteRow(row: SiteRow) {
  return (
    isValidDomainTarget(row.domain) &&
    !isSpamSite({ domain: row.domain, siteTitle: row.site_title })
  )
}

// Invalid domains are always purgeable; spam only while unclaimed, so a claim is never deleted.
export function isPurgeableSiteRow(row: SiteRow) {
  const domain = String(row.domain ?? '')
    .trim()
    .toLowerCase()
  if (!domain) return false
  if (!isValidDomainTarget(domain)) return true
  return !row.email && isSpamSite({ domain, siteTitle: row.site_title })
}

const MAX_SEARCH_LENGTH = 100

// SQLite's lower() folds only ASCII, so fold only ASCII here too.
function asciiLower(value: string) {
  return value.replace(/[A-Z]/g, char => char.toLowerCase())
}

// A site search: collapsed whitespace, at most 100 characters, ASCII case folded. Queries match
// it with instr(), never LIKE: D1 refuses LIKE patterns over 50 bytes.
export function normalizeSearchQuery(value: unknown): string | null {
  const collapsed = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!collapsed) return null
  return asciiLower(Array.from(collapsed).slice(0, MAX_SEARCH_LENGTH).join('').trim())
}
