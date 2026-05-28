import { NextResponse } from "next/server"

import { fetchDomainRating } from "@/server/dr-providers.mjs"

export const runtime = "nodejs"

export async function GET(request: Request) {
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
