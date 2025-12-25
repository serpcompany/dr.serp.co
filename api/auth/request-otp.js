import { createOtp } from '../../server/otp-store.mjs'

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
  if (!isValidEmail(email)) {
    sendJson(res, 400, { error: 'Valid email required' })
    return
  }

  const { ok, code, retryAfterMs } = createOtp(email)
  if (!ok) {
    sendJson(res, 429, { error: 'Please wait before requesting another code', retryAfterMs })
    return
  }

  const apiKey = process.env.USESEND_API_KEY
  if (!apiKey) {
    sendJson(res, 500, { error: 'Missing USESEND_API_KEY' })
    return
  }

  const from = process.env.USESEND_FROM || 'DR Checker <no-reply@mail.serp.co>'
  const subject = 'Your DR Checker login code'
  const html = `<p>Your DR Checker code is <strong>${code}</strong>. It expires in 10 minutes.</p>`
  const text = `Your DR Checker code is ${code}. It expires in 10 minutes.`

  const response = await fetch('https://app.usesend.com/api/v1/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: email,
      from,
      subject,
      html,
      text,
    }),
  })

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    sendJson(res, 502, { error: 'Failed to send OTP email', details })
    return
  }

  sendJson(res, 200, { ok: true })
}
