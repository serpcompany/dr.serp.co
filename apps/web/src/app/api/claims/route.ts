import { NextResponse } from 'next/server'
import { clearClaimEmail, getClaim, setClaimEmail } from '@/db'
import { getSessionEmail } from '@/server/auth/session'
import { normalizeTarget } from '@/server/dr-providers.mjs'
import { resolveEntitlement } from '@/server/entitlements.mjs'
import { readWriteRequest } from '@/server/write-route'
import { DomainBody } from '@/server/write-schemas'

export const runtime = 'nodejs'

function authRequired() {
  return NextResponse.json({ error: 'Sign in required.', code: 'auth_required' }, { status: 401 })
}

function claimedByOther() {
  return NextResponse.json(
    { error: 'This site is already claimed by another account.', code: 'claimed_by_other' },
    { status: 409 }
  )
}

export async function POST(request: Request) {
  const read = await readWriteRequest(request, DomainBody)
  if (!read.ok) return read.response

  const email = await getSessionEmail(request)
  if (!email) return authRequired()

  const domain = normalizeTarget(read.data.domain)
  if (!domain) {
    return NextResponse.json({ error: 'Valid domain required' }, { status: 400 })
  }

  const existing = await getClaim(domain)
  const existingEmail = String(existing?.email ?? '')
    .trim()
    .toLowerCase()
  if (existingEmail && existingEmail !== email) return claimedByOther()

  if (existingEmail !== email) {
    const entitlement = await resolveEntitlement({ email })
    if (!entitlement?.canClaim) {
      return NextResponse.json(
        {
          error: 'Upgrade required to claim more domains.',
          code: 'upgrade_required',
          entitlement
        },
        { status: 402 }
      )
    }
  }

  // setClaimEmail refuses to overwrite another owner, which also covers a claim racing this one.
  const claim = await setClaimEmail({ domain, email })
  if (!claim) return claimedByOther()
  return NextResponse.json({ ok: true, claim })
}

export async function DELETE(request: Request) {
  const read = await readWriteRequest(request, DomainBody)
  if (!read.ok) return read.response

  const email = await getSessionEmail(request)
  if (!email) return authRequired()

  const domain = normalizeTarget(read.data.domain)
  if (!domain) {
    return NextResponse.json({ error: 'Valid domain required' }, { status: 400 })
  }

  const claim = await clearClaimEmail({ domain, email })
  return NextResponse.json({ ok: true, claim })
}
