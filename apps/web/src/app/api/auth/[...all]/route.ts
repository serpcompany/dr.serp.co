// Better Auth's one route handler. config.ts serves only send-code, sign-in, get-session and
// sign-out; everything else under /api/auth answers 404. Missing configuration answers 503.
import { NextResponse } from 'next/server'

import { getAuth } from '@/server/auth'
import { scrubError } from '@/server/auth/logging'

export const runtime = 'nodejs'

async function handle(request: Request) {
  const lookup = await getAuth()
  if (!lookup.ok) {
    console.error('auth: not configured', { problem: lookup.problem })
    return NextResponse.json(
      { code: 'AUTH_UNAVAILABLE', message: 'Sign-in is unavailable right now.' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } }
    )
  }
  let response: Response
  try {
    response = await lookup.auth.handler(request)
  } catch (error) {
    // Logged scrubbed: an unhandled D1 error would otherwise carry the email or code hash.
    console.error('auth: request failed', scrubError(error))
    return NextResponse.json(
      { code: 'AUTH_FAILED', message: 'Sign-in failed. Try again shortly.' },
      { status: 500, headers: { 'Cache-Control': 'private, no-store' } }
    )
  }
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'private, no-store')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

export const GET = handle
export const POST = handle
