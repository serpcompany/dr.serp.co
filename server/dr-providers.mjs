import { URL } from 'node:url'

export function normalizeTarget(input) {
  const trimmed = String(input ?? '').trim()
  if (!trimmed) return null
  return trimmed.replace(/^https?:\/\//, '').replace(/\/+$/, '')
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
      'user-agent': 'spark-template/dr-proxy',
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

export async function fetchDomainRating({ target, provider, captchaAnswer, captchaHash } = {}) {
  const normalizedTarget = normalizeTarget(target)
  if (!normalizedTarget) throw new Error('Missing "target"')

  if (provider === 'rhinorank') {
    return fetchDrFromRhinoRank({ target: normalizedTarget, captchaAnswer, captchaHash })
  }
  if (provider === 'editoriallink') {
    return fetchDrFromEditorialLink({ target: normalizedTarget })
  }

  const errors = []

  try {
    const rhino = await fetchDrFromRhinoRank({ target: normalizedTarget, captchaAnswer, captchaHash })
    if (rhino?.captchaRequired) {
      errors.push('RhinoRank requires CAPTCHA')
    } else {
      return rhino
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }

  try {
    return await fetchDrFromEditorialLink({ target: normalizedTarget })
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }

  throw new Error(`All providers failed: ${errors.join(' | ')}`)
}
