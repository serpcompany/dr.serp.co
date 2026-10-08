import { NextResponse } from 'next/server'

import { countSites, listSites } from '@/db'

export const runtime = 'nodejs'

function asInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const q = String(url.searchParams.get('q') ?? '').trim()
  const limit = Math.max(1, Math.min(50, asInt(url.searchParams.get('limit'), 12)))
  const offset = Math.max(0, asInt(url.searchParams.get('offset'), 0))

  const [total, sites] = await Promise.all([
    countSites({ query: q }),
    listSites({ query: q, limit, offset, sort: 'dr' })
  ])

  return NextResponse.json({ total, sites })
}
