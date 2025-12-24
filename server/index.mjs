import http from 'node:http'
import { URL } from 'node:url'
import { fetchDomainRating } from './dr-providers.mjs'

const port = Number(process.env.AHREFS_PROXY_PORT || process.env.PORT || 5055)

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

function setCors(res) {
  res.setHeader('access-control-allow-origin', process.env.AHREFS_PROXY_CORS_ORIGIN || '*')
  res.setHeader('access-control-allow-methods', 'GET,OPTIONS')
  res.setHeader('access-control-allow-headers', 'content-type')
}

const server = http.createServer(async (req, res) => {
  setCors(res)

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (!req.url) {
    sendJson(res, 400, { error: 'Missing URL' })
    return
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/ahrefs/domain-rating') {
    try {
      const target = url.searchParams.get('target')
      const provider = url.searchParams.get('provider') || undefined
      const captchaAnswer = url.searchParams.get('captcha_answer') || undefined
      const captchaHash = url.searchParams.get('captcha_hash') || undefined

      const result = await fetchDomainRating({
        target,
        provider,
        captchaAnswer,
        captchaHash,
      })

      if (result?.captchaRequired) {
        sendJson(res, 200, {
          target: result.target,
          provider: result.provider,
          captchaRequired: true,
          captcha: result.captcha,
          remainingAttempts: result.remainingAttempts,
          message: result.message,
        })
        return
      }

      sendJson(res, 200, {
        target: result.target,
        provider: result.provider,
        domainRating: result.domainRating,
        extra: result.extra ?? null,
      })
    } catch (error) {
      sendJson(res, 400, {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
    return
  }

  sendJson(res, 404, { error: 'Not found' })
})

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Ahrefs proxy listening on http://localhost:${port}`)
  // eslint-disable-next-line no-console
  console.log('GET /api/ahrefs/domain-rating?target=example.com')
})
