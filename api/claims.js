import { normalizeTarget } from '../server/dr-providers.mjs'
import { upsertClaim } from '../server/db.mjs'

function sendJson(res, statusCode, data) {
  res.status(statusCode).json(data)
}

async function readJson(req) {
  if (req.body) {
    if (typeof req.body === 'string') return JSON.parse(req.body)
    return req.body
  }
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST')
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  const body = await readJson(req).catch(() => ({}))
  const domain = normalizeTarget(body?.domain)
  if (!domain) {
    sendJson(res, 400, { error: 'Valid domain required' })
    return
  }

  const domainRating = Number(body?.domainRating)
  if (!Number.isFinite(domainRating)) {
    sendJson(res, 400, { error: 'Valid domainRating required' })
    return
  }

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : null
  const provider = typeof body?.provider === 'string' ? body.provider : null

  const result = await upsertClaim({ domain, email, domainRating, provider })
  if (!result) {
    sendJson(res, 503, { error: 'Database not configured' })
    return
  }

  sendJson(res, 200, { ok: true, claim: result })
}
