import { fetchDomainRating } from '../../server/dr-providers.mjs'

const cache = globalThis.__drCache || new Map()
globalThis.__drCache = cache

function sendJson(res, statusCode, data) {
  res.status(statusCode).json(data)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET')
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  const target = req.query?.target
  const provider = req.query?.provider
  const captchaAnswer = req.query?.captcha_answer
  const captchaHash = req.query?.captcha_hash

  const cacheKey = JSON.stringify({
    target,
    provider: provider || 'auto',
    captcha: Boolean(captchaAnswer || captchaHash),
  })

  const cached = cache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) {
    sendJson(res, 200, cached.value)
    return
  }

  try {
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

    const value = {
      target: result.target,
      provider: result.provider,
      domainRating: result.domainRating,
      extra: result.extra ?? null,
    }

    cache.set(cacheKey, { value, expiresAt: Date.now() + 6 * 60 * 60 * 1000 })
    sendJson(res, 200, value)
  } catch (error) {
    sendJson(res, 400, {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

