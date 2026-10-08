import { NextResponse } from 'next/server'

import {
  getSessionEmail,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS
} from '@/server/auth-session.mjs'
import { EMPTY_BODY, readWriteRequest } from '@/server/write-route'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  return NextResponse.json(
    { email: getSessionEmail(request) },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}

export async function DELETE(request: Request) {
  const read = await readWriteRequest(request, EMPTY_BODY)
  if (!read.ok) return read.response

  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE_NAME, '', { ...SESSION_COOKIE_OPTIONS, maxAge: 0 })
  return response
}
