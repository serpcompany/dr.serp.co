import { URL } from 'node:url'
import { normalizeTarget } from '@/server/domain-target.mjs'

export { normalizeTarget }

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

function frogDrSessionLooksAuthenticated(html) {
  const normalized = String(html ?? '').toLowerCase()
  if (!normalized) return false
  if (normalized.includes('href="/sign-in"') || normalized.includes('>sign in<')) return false
  return normalized.includes('ajxdom') || normalized.includes('sign out') || normalized.includes('dashboard')
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

function clampDr(value) {
  const dr = Math.max(0, Math.min(100, Math.floor(Number(value))))
  return Number.isFinite(dr) ? dr : null
}

function getAhrefsApiDate() {
  return new Date().toISOString().slice(0, 10)
}

function formatAhrefsApiDate(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : getAhrefsApiDate()
  }
  const raw = String(value ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const parsed = new Date(raw)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : getAhrefsApiDate()
}

function getAhrefsApiDateYearsAgo(years, date = getAhrefsApiDate()) {
  const source = new Date(`${formatAhrefsApiDate(date)}T00:00:00.000Z`)
  if (!Number.isFinite(source.getTime())) return getAhrefsApiDate()
  source.setUTCFullYear(source.getUTCFullYear() - years)
  return source.toISOString().slice(0, 10)
}

function extractApiError(payload, fallback) {
  const error = payload?.error
  if (typeof error === 'string' && error.trim()) return error.trim()
  if (typeof error?.message === 'string' && error.message.trim()) return error.message.trim()
  if (Array.isArray(payload?.errors)) {
    const firstMessage = payload.errors
      .map((entry) => entry?.message)
      .find((message) => typeof message === 'string' && message.trim())
    if (firstMessage) return firstMessage.trim()
  }
  if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message.trim()
  return fallback
}

export function extractDrFromFrogDrHtml(html) {
  const source = String(html ?? '')

  const metaMatch = source.match(/currently at DR(\d{1,3})\b/i)
  const metaDr = clampDr(metaMatch?.[1])
  if (metaDr !== null && metaDr > 0) return metaDr

  const datasetMatch = source.match(/datasets:\s*\[\s*\{[\s\S]*?data:\s*\[([\d,\s]+)\]/i)
  if (datasetMatch?.[1]) {
    const values = datasetMatch[1]
      .split(',')
      .map((entry) => clampDr(entry))
      .filter((entry) => entry !== null)
    const last = values.at(-1)
    if (last !== undefined && last !== null && last > 0) return last
  }

  return null
}

export async function fetchDrFromAhrefsApi({ target, date = getAhrefsApiDate() } = {}) {
  const normalizedTarget = normalizeTarget(target)
  if (!normalizedTarget) throw new Error('Missing "target"')

  const apiKey = String(process.env.AHREFS_API_KEY ?? '').trim()
  if (!apiKey) throw new Error('AHREFS_API_KEY env var not set')

  const url = new URL('https://api.ahrefs.com/v3/site-explorer/domain-rating')
  url.searchParams.set('target', normalizedTarget)
  url.searchParams.set('date', date)
  url.searchParams.set('protocol', 'both')
  url.searchParams.set('output', 'json')

  const response = await fetch(String(url), {
    method: 'GET',
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  })

  const text = await response.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new Error(extractApiError(payload, `Ahrefs API request failed (${response.status})`))
  }

  const domainRating = Number(payload?.domain_rating?.domain_rating)
  if (!Number.isFinite(domainRating)) {
    throw new Error('Ahrefs API response missing Domain Rating')
  }

  const rawAhrefsRank = payload?.domain_rating?.ahrefs_rank
  const parsedAhrefsRank = rawAhrefsRank === null || rawAhrefsRank === undefined ? null : Number(rawAhrefsRank)

  return {
    provider: 'ahrefs',
    target: normalizedTarget,
    domainRating,
    extra: {
      ahrefsRank: Number.isFinite(parsedAhrefsRank) ? parsedAhrefsRank : null,
      date,
    },
  }
}

/**
 * @param {{ target?: (string|null), dateFrom?: string, dateTo?: string, historyGrouping?: string }} [input]
 */
export async function fetchDomainRatingHistory({
  target,
  dateFrom,
  dateTo = getAhrefsApiDate(),
  historyGrouping = 'monthly',
} = {}) {
  const normalizedTarget = normalizeTarget(target)
  if (!normalizedTarget) throw new Error('Missing "target"')

  const apiKey = String(process.env.AHREFS_API_KEY ?? '').trim()
  if (!apiKey) throw new Error('AHREFS_API_KEY env var not set')

  const resolvedDateTo = formatAhrefsApiDate(dateTo || getAhrefsApiDate())
  const resolvedDateFrom = dateFrom
    ? formatAhrefsApiDate(dateFrom)
    : getAhrefsApiDateYearsAgo(2, resolvedDateTo)
  const resolvedHistoryGrouping = String(historyGrouping || 'monthly')

  const url = new URL('https://api.ahrefs.com/v3/site-explorer/domain-rating-history')
  url.searchParams.set('target', normalizedTarget)
  url.searchParams.set('date_from', resolvedDateFrom)
  url.searchParams.set('date_to', resolvedDateTo)
  url.searchParams.set('history_grouping', resolvedHistoryGrouping)
  url.searchParams.set('protocol', 'both')
  url.searchParams.set('output', 'json')

  const response = await fetch(String(url), {
    method: 'GET',
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  })

  const text = await response.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new Error(extractApiError(payload, `Ahrefs API request failed (${response.status})`))
  }

  if (!Array.isArray(payload?.domain_ratings)) {
    throw new Error('Ahrefs API response missing Domain Rating history')
  }

  const points = payload.domain_ratings
    .map((row) => {
      const checkedAt = typeof row?.date === 'string' ? row.date : null
      const domainRating = Number(row?.domain_rating)
      if (!checkedAt || !Number.isFinite(domainRating)) return null
      return { checkedAt, domainRating }
    })
    .filter((row) => row !== null)

  return {
    provider: 'ahrefs-history',
    target: normalizedTarget,
    dateFrom: resolvedDateFrom,
    dateTo: resolvedDateTo,
    historyGrouping: resolvedHistoryGrouping,
    points,
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

  const dashboardRes = await fetch('https://frogdr.com/', {
    headers: authHeaders,
    redirect: 'follow',
  })
  const dashboardHtml = await dashboardRes.text()
  if (!frogDrSessionLooksAuthenticated(dashboardHtml)) {
    throw new Error('FROGDR_SESSION is invalid or expired')
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
    const extracted = extractDrFromFrogDrHtml(html)
    if (extracted !== null) {
      dr = extracted
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

export async function fetchDomainRating({ target, provider, captchaAnswer, captchaHash, date } = {}) {
  const normalizedTarget = normalizeTarget(target)
  if (!normalizedTarget) throw new Error('Missing "target"')

  if (provider === 'ahrefs' || provider === 'ahrefs-api') {
    return fetchDrFromAhrefsApi({ target: normalizedTarget, date })
  }
  if (provider === 'rhinorank') {
    return fetchDrFromRhinoRank({ target: normalizedTarget, captchaAnswer, captchaHash })
  }
  if (provider === 'editoriallink') {
    return fetchDrFromEditorialLink({ target: normalizedTarget })
  }
  if (provider === 'frogdr') {
    return fetchDrFromFrogDR({ target: normalizedTarget })
  }

  if (process.env.AHREFS_API_KEY) {
    try {
      return await fetchDrFromAhrefsApi({ target: normalizedTarget, date })
    } catch (error) {
      if (!process.env.FROGDR_SESSION) throw error
    }
  }

  // Try FrogDR if a session is configured
  if (process.env.FROGDR_SESSION) {
    return fetchDrFromFrogDR({ target: normalizedTarget })
  }

  // No working provider available
  throw new Error(
    'All providers unavailable: Set AHREFS_API_KEY to enable Ahrefs API | Set FROGDR_SESSION to enable FrogDR'
  )
}
