import { NextResponse } from 'next/server'

import { getSessionEmail } from '@/server/auth-session.mjs'
import { resolveEntitlement } from '@/server/entitlements.mjs'
import { EMPTY_BODY, readWriteRequest } from '@/server/write-route'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const read = await readWriteRequest(request, EMPTY_BODY)
  if (!read.ok) return read.response

  const email = getSessionEmail(request)
  if (!email) {
    return NextResponse.json({ error: 'Sign in required.', code: 'auth_required' }, { status: 401 })
  }

  const entitlement = await resolveEntitlement({ email })

  return NextResponse.json({ ok: true, entitlement })
}
