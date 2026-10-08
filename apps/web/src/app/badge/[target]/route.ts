import { getClaim, getDrChecks, upsertClaim } from '@/server/db.mjs'
import { normalizeTarget } from '@/server/dr-providers.mjs'
import { type BadgeTemplateKey, badgeTemplates } from './badge-templates'

export const runtime = 'nodejs'

const templates = {
  badge1: 'serp-dr-v3',
  'serp-dr-v2': 'serp-dr-v2',
  'serp-dr-v3': 'serp-dr-v3',
  verified: 'serp-dr-v3'
} as const

const DEFAULT_STYLE: keyof typeof templates = 'serp-dr-v3'
const DEFAULT_DR_VALUE = '0'
const UNKNOWN_DR_VALUE = '?'
const BADGE_CACHE_CONTROL = 'public'

function resolveTemplateKey(style: string | null): BadgeTemplateKey {
  const key = String(style ?? '')
    .trim()
    .toLowerCase()
  if (key && key in templates) return templates[key as keyof typeof templates]
  return templates[DEFAULT_STYLE]
}

function getFontSizeForValue(value: string) {
  if (value.length <= 1) return '84'
  if (value.length === 2) return '72'
  return '60'
}

// Total path length of the 300° horseshoe arc (r=13): (300/360) * 2π * 13
const RING_ARC_LENGTH = (300 / 360) * 2 * Math.PI * 13

function computeDasharray(value: string): string {
  const score = parseInt(value, 10)
  if (!Number.isFinite(score)) return `0 ${RING_ARC_LENGTH.toFixed(2)}`
  const clamped = Math.max(0, Math.min(100, score))
  const filled = (clamped / 100) * RING_ARC_LENGTH
  const gap = RING_ARC_LENGTH - filled
  return `${filled.toFixed(2)} ${gap.toFixed(2)}`
}

function renderBadgeSvg(templateKey: BadgeTemplateKey, value: string) {
  const template = badgeTemplates[templateKey]
  const safeValue = value.trim() === '?' ? '?' : value.replace(/[^0-9]/g, '')
  const normalizedValue = safeValue || DEFAULT_DR_VALUE

  let svg = template.replaceAll('__DR__', normalizedValue)

  if (svg.includes('__DR_DASHARRAY__')) {
    svg = svg.replaceAll('__DR_DASHARRAY__', computeDasharray(normalizedValue))
  }

  if (svg.includes('__DR_FONT_SIZE__')) {
    svg = svg.replaceAll('__DR_FONT_SIZE__', getFontSizeForValue(normalizedValue))
  }

  return svg
}

export async function GET(request: Request, context: { params: Promise<{ target: string }> }) {
  const params = await context.params
  const normalizedTarget = normalizeTarget(params?.target)
  if (!normalizedTarget) {
    return new Response('Missing target', { status: 400 })
  }

  const url = new URL(request.url)
  const templateKey = resolveTemplateKey(url.searchParams.get('style'))
  const override = url.searchParams.get('dr')
  if (override !== null) {
    const dr = Math.max(0, Math.min(100, Math.floor(Number(override))))
    const svg = renderBadgeSvg(templateKey, Number.isFinite(dr) ? String(dr) : DEFAULT_DR_VALUE)
    return new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    })
  }

  try {
    const cachedClaim = await getClaim(normalizedTarget)
    if (cachedClaim?.domain_rating !== null && cachedClaim?.domain_rating !== undefined) {
      const dr = Math.max(0, Math.min(100, Math.floor(Number(cachedClaim.domain_rating))))
      const svg = renderBadgeSvg(templateKey, Number.isFinite(dr) ? String(dr) : DEFAULT_DR_VALUE)

      return new Response(svg, {
        headers: {
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Cache-Control': BADGE_CACHE_CONTROL
        }
      })
    }

    const checks = await getDrChecks(normalizedTarget, { limit: 1 })
    if (checks.length > 0) {
      const last = checks[checks.length - 1] as any
      const dr = Math.max(0, Math.min(100, Math.floor(Number(last?.domain_rating))))
      if (Number.isFinite(dr)) {
        await upsertClaim({
          domain: normalizedTarget,
          domainRating: dr,
          provider: last?.provider ?? null
        })
        const svg = renderBadgeSvg(templateKey, String(dr))
        return new Response(svg, {
          headers: {
            'Content-Type': 'image/svg+xml; charset=utf-8',
            'Cache-Control': BADGE_CACHE_CONTROL
          }
        })
      }
    }

    const svg = renderBadgeSvg(templateKey, UNKNOWN_DR_VALUE)
    return new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': BADGE_CACHE_CONTROL
      }
    })
  } catch (error) {
    // Errors can name internal details, and badges are embedded on third-party sites, so log
    // them on the server and render the unknown badge.
    console.error('badge: lookup failed', { error: error instanceof Error ? error.message : error })
    const svg = renderBadgeSvg(templateKey, UNKNOWN_DR_VALUE)
    return new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    })
  }
}
