import { URL } from 'node:url'

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

function isValidDomain(host) {
  if (!host || host.startsWith('.')) return false
  // Must have at least one dot (needs a TLD)
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
  // Strip protocol, then take only the host portion (drop path/query/hash)
  const withoutProtocol = trimmed.replace(/^https?:\/\//, '')
  const host = withoutProtocol.split('/')[0].split('?')[0].split('#')[0].replace(/\.+$/, '').toLowerCase()
  if (!isValidDomain(host)) return null
  return host
}

function cookieHeaderFromResponse(response) {
  const getSetCookie = response.headers.getSetCookie
  const setCookies = typeof getSetCookie === 'function' ? getSetCookie.call(response.headers) : []
  if (!Array.isArray(setCookies) || setCookies.length === 0) return ''
  return setCookies
    .map((c) => c.split(';')[0])
    .filter(Boolean)
    .join('; ')
}

async function fetchText(url, { cookieHeader = '', headers = {}, method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'user-agent': 'dr.serp.co/dr-proxy',
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...headers,
    },
    body,
    redirect: 'follow',
  })
  const text = await res.text()
  return { res, text }
}

function parseJsonInlineVariable(html, variableName) {
  const re = new RegExp(`var\\s+${variableName}\\s*=\\s*(\\{[\\s\\S]*?\\});`)
  const m = html.match(re)
  if (!m) return null
  try {
    return JSON.parse(m[1])
  } catch {
    return null
  }
}

export async function fetchDrFromRhinoRank({ target, captchaAnswer, captchaHash } = {}) {
  const normalizedTarget = normalizeTarget(target)
  if (!normalizedTarget) throw new Error('Missing "target"')

  const pageUrl = 'https://www.rhinorank.io/da-dr-checker/'
  const { res: pageRes, text: pageHtml } = await fetchText(pageUrl)
  const cookieHeader = cookieHeaderFromResponse(pageRes)

  const rrdcAjax = parseJsonInlineVariable(pageHtml, 'rrdc_ajax')
  const ajaxUrl = rrdcAjax?.ajax_url
  const nonce = rrdcAjax?.nonce

  if (!ajaxUrl || !nonce) {
    throw new Error('RhinoRank page format changed (missing ajax_url/nonce)')
  }

  const form = new URLSearchParams()
  form.set('action', 'rrdc_check_domain')
  form.set('domain', normalizedTarget)
  form.set('nonce', nonce)
  if (captchaAnswer && captchaHash) {
    form.set('captcha_answer', captchaAnswer)
    form.set('captcha_hash', captchaHash)
  }

  const { res: apiRes, text: apiText } = await fetchText(ajaxUrl, {
    method: 'POST',
    cookieHeader,
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      origin: 'https://www.rhinorank.io',
      referer: pageUrl,
      accept: 'application/json',
    },
    body: form,
  })

  if (!apiRes.ok) {
    throw new Error(`RhinoRank request failed (${apiRes.status})`)
  }

  let json
  try {
    json = JSON.parse(apiText)
  } catch {
    throw new Error('RhinoRank returned non-JSON response')
  }

  if (json?.success && json?.data?.success && json?.data?.metrics) {
    const dr = Number(json.data.metrics.dr)
    if (!Number.isFinite(dr)) throw new Error('RhinoRank response missing DR')
    return {
      provider: 'rhinorank',
      target: json.data.domain || normalizedTarget,
      domainRating: dr,
      extra: {
        da: Number(json.data.metrics.da) || null,
        ahrefsRank: Number(json.data.metrics.ahrefs_rank) || null,
        cached: json.data.cached || null,
      },
    }
  }

  const message = json?.data?.message
  const captchaRequired = Boolean(json?.data?.captcha_required)
  if (captchaRequired) {
    return {
      provider: 'rhinorank',
      target: normalizedTarget,
      captchaRequired: true,
      captcha: json?.data?.captcha ?? null,
      remainingAttempts: json?.data?.remaining_attempts ?? null,
      message: typeof message === 'string' ? message : 'CAPTCHA required',
    }
  }

  throw new Error(typeof message === 'string' ? message : 'RhinoRank lookup failed')
}

export async function fetchDrFromEditorialLink({ target } = {}) {
  const normalizedTarget = normalizeTarget(target)
  if (!normalizedTarget) throw new Error('Missing "target"')

  const pageUrl = 'https://editorial.link/da-dr-checker/'
  const { res: pageRes, text: pageHtml } = await fetchText(pageUrl)
  const cookieHeader = cookieHeaderFromResponse(pageRes)

  const nonceMatch = pageHtml.match(/id="moz_da_nonce"[^>]*value="([^"]+)"/)
  const nonce = nonceMatch?.[1]
  if (!nonce) {
    throw new Error('Editorial.Link page format changed (missing moz_da_nonce)')
  }

  const form = new URLSearchParams()
  form.set('moz_url', normalizedTarget)
  form.set('moz_da_nonce', nonce)

  const { res: postRes, text: postHtml } = await fetchText(pageUrl, {
    method: 'POST',
    cookieHeader,
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      origin: 'https://editorial.link',
      referer: pageUrl,
    },
    body: form,
  })

  if (!postRes.ok) {
    throw new Error(`Editorial.Link request failed (${postRes.status})`)
  }

  if (postHtml.includes('You have reached the maximum number of checks per day')) {
    throw new Error('Editorial.Link rate limit reached')
  }

  const sectionIdx = postHtml.indexOf('<h3>Ahrefs DR/UR</h3>')
  if (sectionIdx === -1) {
    throw new Error('Editorial.Link response missing Ahrefs DR/UR section')
  }

  const after = postHtml.slice(sectionIdx, sectionIdx + 2000)
  const numberMatch = after.match(/<div class="ddc__result-number"[^>]*>\s*<p>(\d+)<\/p>/)
  const dr = numberMatch ? Number(numberMatch[1]) : NaN
  if (!Number.isFinite(dr)) {
    throw new Error('Editorial.Link response missing DR number')
  }

  return {
    provider: 'editoriallink',
    target: normalizedTarget,
    domainRating: dr,
    extra: null,
  }
}

/**
 * FrogDR provider — uses a free frogdr.com account session to look up DR.
 *
 * Flow (free tier allows 3 tracked domains):
 *   1. Add the domain:  GET /ajxDom?add={domain}  (authenticated)
 *   2. Trigger refresh: GET /ajxDom?upd={domain}  (authenticated)
 *   3. Scrape DR:       GET /{domain}              (public page, DR in HTML)
 *   4. Remove domain:   GET /ajxDom?d={domain}    (authenticated, frees the slot)
 *
 * Required env var: FROGDR_SESSION  (value of the PHPSESSID cookie from a logged-in
 * frogdr.com browser session — grab it from DevTools → Application → Cookies)
 *
 * NOTE: The /ajxDom?add= endpoint is inferred from the naming pattern of the other
 * endpoints. If it silently fails, the alternative is a POST to / with body `d={domain}`.
 */
export async function fetchDrFromFrogDR({ target } = {}) {
  const normalizedTarget = normalizeTarget(target)
  if (!normalizedTarget) throw new Error('Missing "target"')

  const session = process.env.FROGDR_SESSION
  if (!session) throw new Error('FROGDR_SESSION env var not set')

  const authHeaders = {
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'cookie': `PHPSESSID=${session}`,
    'referer': 'https://frogdr.com/',
  }

  // Step 1: add domain to dashboard (may already be tracked — that's fine)
  const addRes = await fetch(`https://frogdr.com/ajxDom?add=${encodeURIComponent(normalizedTarget)}`, {
    headers: authHeaders,
    redirect: 'follow',
  })
  if (!addRes.ok && addRes.status !== 200) {
    throw new Error(`FrogDR add failed (${addRes.status})`)
  }

  // Step 2: trigger a fresh DR fetch
  await fetch(`https://frogdr.com/ajxDom?upd=${encodeURIComponent(normalizedTarget)}`, {
    headers: authHeaders,
    redirect: 'follow',
  })

  // Step 3: poll the public domain page until DR data appears (up to ~15s)
  let dr = null
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2500))
    const pageRes = await fetch(`https://frogdr.com/${encodeURIComponent(normalizedTarget)}`, {
      headers: { ...authHeaders, 'accept': 'text/html' },
      redirect: 'follow',
    })
    if (!pageRes.ok) continue
    const html = await pageRes.text()
    // DR appears as: <h3 style="font-size:20px;font-weight:bold;color:#000">91</h3>
    const m = html.match(/<h3[^>]*font-size:20px[^>]*>\s*(\d+)\s*<\/h3>/)
    if (m) {
      dr = Number(m[1])
      break
    }
  }

  // Step 4: always remove the domain to keep the slot free
  try {
    await fetch(`https://frogdr.com/ajxDom?d=${encodeURIComponent(normalizedTarget)}`, {
      headers: authHeaders,
      redirect: 'follow',
    })
  } catch {
    // Non-fatal — removal failure just uses up a slot until manual cleanup
  }

  if (dr === null || !Number.isFinite(dr)) {
    throw new Error('FrogDR response missing DR number')
  }

  return {
    provider: 'frogdr',
    target: normalizedTarget,
    domainRating: dr,
    extra: null,
  }
}

export async function fetchDomainRating({ target, provider, captchaAnswer, captchaHash } = {}) {
  const normalizedTarget = normalizeTarget(target)
  if (!normalizedTarget) throw new Error('Missing "target"')

  if (provider === 'rhinorank') {
    return fetchDrFromRhinoRank({ target: normalizedTarget, captchaAnswer, captchaHash })
  }
  if (provider === 'editoriallink') {
    return fetchDrFromEditorialLink({ target: normalizedTarget })
  }
  if (provider === 'frogdr') {
    return fetchDrFromFrogDR({ target: normalizedTarget })
  }

  // Try FrogDR if a session is configured
  if (process.env.FROGDR_SESSION) {
    return fetchDrFromFrogDR({ target: normalizedTarget })
  }

  // No working provider available
  throw new Error(
    'All providers unavailable: RhinoRank requires Cloudflare Turnstile | Editorial.Link checker removed | Set FROGDR_SESSION to enable FrogDR'
  )
}
