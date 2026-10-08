import { NextResponse } from 'next/server'

import { getSessionEmail } from '@/server/auth-session.mjs'
import { countClaimsByEmail, listClaimsByEmail } from '@/server/db.mjs'
import { resolveEntitlement } from '@/server/entitlements.mjs'
import { readWriteRequest } from '@/server/write-route'
import { MySitesBody } from '@/server/write-schemas'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const read = await readWriteRequest(request, MySitesBody)
  if (!read.ok) return read.response

  const email = getSessionEmail(request)
  if (!email) {
    return NextResponse.json({ error: 'Sign in required.', code: 'auth_required' }, { status: 401 })
  }

  const query = (read.data.query ?? '').trim()
  const limitRaw = Number(read.data.limit)
  const offsetRaw = Number(read.data.offset)

  const entitlement = await resolveEntitlement({ email })
  if (!entitlement?.canAccessPaidFeatures) {
    return NextResponse.json({
      ok: false,
      error: 'Upgrade required to manage monitored domains.',
      code: 'upgrade_required',
      entitlement
    })
  }

  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.floor(limitRaw))) : 12
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0

  const [total, sites] = await Promise.all([
    countClaimsByEmail({ email, query }),
    listClaimsByEmail({ email, query, limit, offset, sort: 'updated' })
  ])

  return NextResponse.json({ ok: true, total, sites })
}
