import { verifyOtp } from '../../server/otp-store.mjs'

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

function isValidEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST')
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  const body = await readJson(req).catch(() => ({}))
  const email = String(body?.email || '').trim().toLowerCase()
  const code = String(body?.code || '').trim()

  if (!isValidEmail(email) || !code) {
    sendJson(res, 400, { error: 'Email and code required' })
    return
  }

  const result = verifyOtp(email, code)
  if (!result.ok) {
    sendJson(res, 401, { error: result.error || 'Invalid code' })
    return
  }

  sendJson(res, 200, { ok: true })
}
