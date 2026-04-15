// Extensions that are never valid TLDs — block filenames like robots.txt, wp-login.php, backup.sql, etc.
const BLOCKED_TLDS = new Set([
  'bak', 'bz2', 'cfg', 'conf', 'crt', 'csr', 'csv', 'doc', 'docx', 'env',
  'gif', 'gz', 'htm', 'html', 'ico', 'ini', 'jar', 'java', 'jpeg', 'jpg',
  'js', 'json', 'jsx', 'key', 'lock', 'log', 'md', 'mp3', 'mp4', 'mpeg',
  'pdf', 'pem', 'php', 'png', 'py', 'rar', 'rb', 'rs', 'sh', 'sql', 'svg',
  'tar', 'ts', 'tsx', 'txt', 'webp', 'xls', 'xlsx', 'xml', 'yaml', 'yml',
  'zip',
])

const LABEL_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i

function isValidDomainHost(host) {
  if (!host || host.startsWith('.')) return false
  if (!host.includes('.')) return false

  const labels = host.split('.')
  for (const label of labels) {
    if (!label || !LABEL_RE.test(label)) return false
  }

  const tld = labels[labels.length - 1].toLowerCase()
  if (BLOCKED_TLDS.has(tld)) return false

  return true
}

export function normalizeTarget(input) {
  const trimmed = String(input ?? '').trim()
  if (!trimmed) return null

  const withoutProtocol = trimmed.replace(/^https?:\/\//, '')
  const host = withoutProtocol
    .split('/')[0]
    .split('?')[0]
    .split('#')[0]
    .replace(/\.+$/, '')
    .toLowerCase()
    .replace(/^www\./, '')

  if (!isValidDomainHost(host)) return null
  return host
}

export function isValidDomainTarget(input) {
  return normalizeTarget(input) !== null
}
