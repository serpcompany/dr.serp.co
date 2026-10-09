// The account's add-site lookup (#142): a domain's DR, title and owner, so the dialog can show it
// before claiming. It runs the site page's own loader, so a domain with no stored DR is looked up
// within the same new-lookup caps, and recorded the same way (dr-lookups.md § When Ahrefs is
// called). Signed-in only, and a write, so it takes the Origin check and body cap.
import { NextResponse } from 'next/server'
import { loadSiteSnapshot } from '@/app/sites/[target]/site-snapshot'
import { getSessionEmail } from '@/server/auth/session'
import { normalizeTarget } from '@/server/dr-providers.mjs'
import { getRateLimitKey } from '@/server/rate-limit.mjs'
import { isSpamSite } from '@/server/site-spam.mjs'
import { readWriteRequest } from '@/server/write-route'
import { DomainBody } from '@/server/write-schemas'

export const runtime = 'nodejs'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export async function POST(request: Request) {
  const read = await readWriteRequest(request, DomainBody)
  if (!read.ok) return read.response

  const email = await getSessionEmail(request)
  if (!email) {
    return NextResponse.json(
      { error: 'Sign in required.', code: 'auth_required' },
      { status: 401, headers: NO_STORE }
    )
  }

  const domain = normalizeTarget(read.data.domain)
  if (!domain) {
    return NextResponse.json(
      { error: 'Enter a domain, like example.com.' },
      { status: 400, headers: NO_STORE }
    )
  }
  if (isSpamSite({ domain })) {
    return NextResponse.json(
      { error: "This site can't be listed on dr.serp.co." },
      { status: 404, headers: NO_STORE }
    )
  }

  try {
    const snapshot = await loadSiteSnapshot(domain, {
      rateLimitKey: getRateLimitKey(request, 'new-site-lookup')
    })
    if (isSpamSite({ domain, siteTitle: snapshot.siteTitle })) {
      return NextResponse.json(
        { error: "This site can't be listed on dr.serp.co." },
        { status: 404, headers: NO_STORE }
      )
    }
    const owner = snapshot.claimEmail
      ? snapshot.claimEmail.trim().toLowerCase() === email
        ? 'you'
        : 'other'
      : 'nobody'
    return NextResponse.json(
      {
        domain,
        dr: snapshot.domainRating,
        title: snapshot.siteTitle,
        owner,
        note: snapshot.domainRating === null ? snapshot.lookupError : null
      },
      { headers: NO_STORE }
    )
  } catch (error) {
    // Provider and database errors can name internal details: log, answer a fixed message.
    console.error('sites.lookup: failed', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: "Couldn't look that site up right now. Try again shortly." },
      { status: 503, headers: NO_STORE }
    )
  }
}
