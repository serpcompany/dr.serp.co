'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { loginHref } from '@/lib/auth/callback-url'
import { readJsonRecord } from '@/lib/read-json'
import { upsertSiteHistory } from '@/lib/site-history'

type ClaimStatus = 'none' | 'mine' | 'other'
type Status = 'idle' | 'claiming' | 'claimed' | 'other' | 'upgrade' | 'signin' | 'error'

function readStoredEmail() {
  return window.localStorage.getItem('dr-auth-email')?.trim().toLowerCase() || ''
}

function initialStatus(claimStatus: ClaimStatus): Status {
  if (claimStatus === 'mine') return 'claimed'
  if (claimStatus === 'other') return 'other'
  return 'idle'
}

export function ClaimClient({
  domain,
  claimStatus,
  signedIn
}: {
  domain: string
  claimStatus: ClaimStatus
  signedIn: boolean
}) {
  const router = useRouter()
  const [status, setStatus] = useState<Status>(() => initialStatus(claimStatus))
  const [message, setMessage] = useState<string | null>(null)

  const claim = useCallback(async () => {
    setStatus('claiming')
    setMessage(null)
    try {
      const response = await fetch('/api/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain })
      })
      const payload = await readJsonRecord(response)
      if (response.ok) {
        setStatus('claimed')
        const email = readStoredEmail()
        if (email) upsertSiteHistory(email, { domain })
        router.refresh()
        return
      }
      if (payload?.code === 'upgrade_required') {
        setMessage(
          typeof payload?.error === 'string' ? payload.error : 'Upgrade required to claim domains.'
        )
        setStatus('upgrade')
        return
      }
      if (payload?.code === 'claimed_by_other') {
        setStatus('other')
        return
      }
      if (payload?.code === 'auth_required') {
        setStatus('signin')
        return
      }
      setStatus('error')
    } catch {
      setStatus('error')
    }
  }, [domain, router])

  useEffect(() => {
    const email = readStoredEmail()
    if (email) upsertSiteHistory(email, { domain })

    // Only the add-site flow (?claim=1) claims automatically; browsing a site page never does.
    const url = new URL(window.location.href)
    if (url.searchParams.get('claim') !== '1') return
    url.searchParams.delete('claim')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    if (signedIn && claimStatus === 'none') void claim()
  }, [claim, claimStatus, domain, signedIn])

  if (status === 'idle' || status === 'claiming') {
    if (!signedIn || claimStatus !== 'none') return null
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={status === 'claiming'}
        onClick={() => void claim()}
      >
        {status === 'claiming' ? 'Claiming...' : 'Claim this site'}
      </Button>
    )
  }

  return (
    <p className="max-w-56 text-xs text-muted-foreground">
      {status === 'claimed' ? (
        'Claimed by you'
      ) : status === 'other' ? (
        'Claimed by another account'
      ) : status === 'upgrade' ? (
        <>
          {message || 'Upgrade required to claim domains.'}{' '}
          <Link href="/pricing" className="underline underline-offset-2">
            Upgrade
          </Link>
        </>
      ) : status === 'signin' ? (
        <>
          <Link
            href={loginHref(`/sites/${domain}?claim=1`)}
            className="underline underline-offset-2"
          >
            Sign in again
          </Link>{' '}
          to claim this site.
        </>
      ) : (
        'Could not claim this site.'
      )}
    </p>
  )
}
