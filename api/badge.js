import fs from 'node:fs'
import { fetchDomainRating, normalizeTarget } from '../server/dr-providers.mjs'

const templateUrl = new URL('../svgs/verified-dr.svg', import.meta.url)
const badgeTemplate = globalThis.__badgeTemplate || fs.readFileSync(templateUrl, 'utf8')
globalThis.__badgeTemplate = badgeTemplate

function renderBadgeSvg(value) {
  return badgeTemplate.replace(/<tspan>[^<]*<\/tspan>/, `<tspan>${value}</tspan>`)
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

  try {
    const result = await fetchDomainRating({ target: normalizedTarget })
    if (result?.captchaRequired) {
      throw new Error('DR provider requires CAPTCHA')
    }

    const dr = Math.max(0, Math.min(100, Math.floor(Number(result?.domainRating))))
    const svg = renderBadgeSvg(Number.isFinite(dr) ? String(dr) : '??')

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    res.status(200).send(svg)
  } catch (error) {
    const svg = renderBadgeSvg('??')
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-DR-Error', error instanceof Error ? error.message : 'Unknown error')
    res.status(200).send(svg)
  }
}
