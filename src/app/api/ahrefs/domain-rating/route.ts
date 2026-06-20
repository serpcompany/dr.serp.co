import { NextResponse } from "next/server"

import { fetchDomainRating } from "@/server/dr-providers.mjs"
import { checkRateLimit, getRateLimitKey } from "@/server/rate-limit.mjs"

export const runtime = "nodejs"
const RATE_LIMIT_POINTS = Number(process.env.AHREFS_RATE_LIMIT_POINTS ?? 30)
const RATE_LIMIT_DURATION = Number(process.env.AHREFS_RATE_LIMIT_DURATION ?? 60)

export async function GET(request: Request) {
  const rateKey = getRateLimitKey(request, "ahrefs-domain-rating")
  const rate = await checkRateLimit({ key: rateKey, points: RATE_LIMIT_POINTS, duration: RATE_LIMIT_DURATION })
  if (!rate.allowed) {
    const retryAfter = Math.ceil(rate.retryAfterMs / 1000)
    return NextResponse.json(
      { error: "Too many DR lookup requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    )
  }

  const url = new URL(request.url)
  const target = url.searchParams.get("target") || undefined
  const provider = url.searchParams.get("provider") || undefined
  const captchaAnswer = url.searchParams.get("captcha_answer") || undefined
  const captchaHash = url.searchParams.get("captcha_hash") || undefined
  const date = url.searchParams.get("date") || undefined

  try {
    const result = await fetchDomainRating({
      target,
      provider,
      captchaAnswer,
      captchaHash,
      date,
    })

    if ((result as any)?.captchaRequired) {
      return NextResponse.json({
        target: (result as any).target,
        provider: (result as any).provider,
        captchaRequired: true,
        captcha: (result as any).captcha,
        remainingAttempts: (result as any).remainingAttempts,
        message: (result as any).message,
      })
    }

    return NextResponse.json({
      target: (result as any).target,
      provider: (result as any).provider,
      domainRating: (result as any).domainRating,
      extra: (result as any).extra ?? null,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    )
  }
}
