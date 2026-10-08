// Gambling, escort, darknet-market and pharma sites look up their DR here to get a public /sites page.
// Matching sites are hidden from listings, get a 404 page, and are purged unless claimed.
// Adult keywords are deliberately absent: they would also match our own downloader sites.

const SPAM_TITLE_PATTERNS = [
  /casin[oò]/i,
  /\bslots?\b|\bslot\d+|gacor|\bjudi\b|togel|buku mimpi|jackpot|sweepstakes/i,
  /sportsbook|\bbetting\b|gamstop|zonder cruks|ohne lugas|\b(1x|8x)bet|1хбет|78win|bola88|hero138|toto\b/i,
  /먹튀|토토|카지노|스포츠중계|قمار|เว็บตรง|สล็อต|บาคาร่า/,
  /\bescorts?\b/i,
  /dark ?net|dark ?market/i,
  /cialis|viagra|kamagra/i
]

const SPAM_DOMAIN_PATTERNS = [
  /casino|gambling|slots|slot\d|gacor|togel|judi|betting|sportsbook|soicau/,
  /escort/,
  /darknet|darkmarket|darkode/,
  /cialis|viagra|kamagra/,
  /^tripsc[a-z]*\d+\./
]

/**
 * @param {{ domain?: string | null, siteTitle?: string | null }} site
 */
export function isSpamSite({ domain, siteTitle } = {}) {
  const host = String(domain ?? '')
    .trim()
    .toLowerCase()
  if (host && SPAM_DOMAIN_PATTERNS.some(pattern => pattern.test(host))) return true

  const title = String(siteTitle ?? '')
  return Boolean(title) && SPAM_TITLE_PATTERNS.some(pattern => pattern.test(title))
}
