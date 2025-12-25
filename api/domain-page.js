import { fetchDomainRating, normalizeTarget } from '../server/dr-providers.mjs'

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderPage({ target, domainRating, provider, errorMessage, baseUrl }) {
  const safeTarget = escapeHtml(target)
  const badgePath = `/badge/${encodeURIComponent(target)}`
  const badgeUrl = `${baseUrl}${badgePath}`
  const pageUrl = `${baseUrl}/${encodeURIComponent(target)}`
  const title = `DR for ${safeTarget} | SERP`
  const description =
    domainRating !== null
      ? `Verified Domain Rating for ${safeTarget}: ${domainRating}.`
      : `Live Domain Rating check for ${safeTarget}.`
  const embedSnippet = `<a href="${pageUrl}"><img src="${badgeUrl}" alt="Verified DR for ${safeTarget}" width="200" height="50"></a>`

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${pageUrl}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:image" content="${badgeUrl}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
      :root { color-scheme: light; }
      body { margin: 0; font-family: "Space Grotesk", "Segoe UI", sans-serif; background: #f6f7fb; color: #111; }
      .wrap { max-width: 720px; margin: 0 auto; padding: 56px 20px 72px; }
      .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 28px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); }
      .label { font-size: 13px; text-transform: uppercase; letter-spacing: 0.12em; color: #64748b; }
      .title { font-size: 32px; margin: 10px 0 6px; }
      .rating { font-size: 68px; font-weight: 700; color: #0ea5e9; }
      .meta { font-size: 14px; color: #64748b; }
      .badge { margin: 20px 0 10px; }
      pre { background: #0f172a; color: #e2e8f0; padding: 16px; border-radius: 12px; overflow-x: auto; font-size: 13px; }
      a { color: #0ea5e9; text-decoration: none; }
      a:hover { text-decoration: underline; }
      .footer { margin-top: 24px; font-size: 13px; color: #64748b; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <div class="label">Verified Domain Rating</div>
        <div class="title">${safeTarget}</div>
        ${domainRating !== null ? `<div class="rating">${domainRating}</div>` : `<div class="meta">${escapeHtml(errorMessage || 'Live rating unavailable')}</div>`}
        <div class="meta">${provider ? `Source: ${escapeHtml(provider)}` : ''}</div>
        <div class="badge">
          <img src="${badgePath}" alt="Verified DR badge for ${safeTarget}" width="200" height="50">
        </div>
        <div class="meta">Embed this badge on your site:</div>
        <pre>${escapeHtml(embedSnippet)}</pre>
        <div class="footer">Need your own DR badge? Visit <a href="https://dr.serp.co">dr.serp.co</a>.</div>
      </div>
    </div>
  </body>
</html>`
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const normalizedTarget = normalizeTarget(req.query?.target)
  if (!normalizedTarget) {
    res.status(400).json({ error: 'Missing "target"' })
    return
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host || 'dr.serp.co'
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const baseUrl = `${proto}://${host}`

  try {
    const result = await fetchDomainRating({ target: normalizedTarget })
    if (result?.captchaRequired) {
      const html = renderPage({
        target: normalizedTarget,
        domainRating: null,
        provider: result.provider,
        errorMessage: result.message || 'Provider requires CAPTCHA',
        baseUrl,
      })
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.status(200).send(html)
      return
    }

    const dr = Math.max(0, Math.min(100, Math.floor(Number(result?.domainRating))))
    const html = renderPage({
      target: normalizedTarget,
      domainRating: Number.isFinite(dr) ? dr : null,
      provider: result?.provider,
      errorMessage: null,
      baseUrl,
    })
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    res.status(200).send(html)
  } catch (error) {
    const html = renderPage({
      target: normalizedTarget,
      domainRating: null,
      provider: null,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      baseUrl,
    })
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).send(html)
  }
}
