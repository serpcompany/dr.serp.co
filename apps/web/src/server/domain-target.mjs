// Extensions that are never valid TLDs — block filenames like robots.txt, wp-login.php, backup.sql, etc.
const BLOCKED_TLDS = new Set([
  'bak', 'bz2', 'cfg', 'conf', 'crt', 'csr', 'csv', 'doc', 'docx', 'env',
  'gif', 'gz', 'htm', 'html', 'ico', 'ini', 'jar', 'java', 'jpeg', 'jpg',
  'js', 'json', 'jsx', 'key', 'lock', 'log', 'md', 'mp3', 'mp4', 'mpeg',
  'pdf', 'pem', 'php', 'png', 'py', 'rar', 'rb', 'rs', 'sh', 'sql', 'svg',
  'tar', 'ts', 'tsx', 'txt', 'webp', 'xls', 'xlsx', 'xml', 'yaml', 'yml',
  'zip',
  // Backup/config suffixes probed by vulnerability scanners (config.php.save, aws.properties, config.inc).
  // Some are real but practically unused TLDs; each scanner hit costs a paid DR lookup.
  'backup', 'dist', 'inc', 'old', 'orig', 'properties', 'save', 'swp', 'tmp',
  // Closed brand TLDs with no public sites; only seen as source maps (app.js.map) and env files (env.prod).
  'map', 'prod',
])

// Scanners also probe backups like index.php.dev; block a script/config extension right before these suffixes.
const SCANNER_SUFFIX_TLDS = new Set(['dev', 'new'])

// Well-known config file names that scanners request as bare hosts (dockerfile.dev, outputs.tf, sendmail.cf).
const FILE_NAME_LABELS = new Set(['dockerfile', 'makefile', 'outputs', 'phpinfo', 'sendmail', 'variables'])
const SCRIPT_EXTENSION_LABELS = new Set([
  'asp', 'aspx', 'cfg', 'conf', 'env', 'ini', 'json', 'jsp', 'php', 'phtml',
  'py', 'sql', 'xml', 'yaml', 'yml',
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

  const extensionLabel = labels.length >= 3 ? labels[labels.length - 2].toLowerCase() : null
  if (extensionLabel && SCANNER_SUFFIX_TLDS.has(tld) && SCRIPT_EXTENSION_LABELS.has(extensionLabel)) return false
  if (labels.length === 2 && FILE_NAME_LABELS.has(labels[0].toLowerCase())) return false

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
