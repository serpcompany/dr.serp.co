'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { BillingPortalButton } from '@/app/_components/billing-portal-button'
import { Button } from '@/components/ui/button'

function readEmail() {
  return window.localStorage.getItem('dr-auth-email')?.trim().toLowerCase() || ''
}

export function BillingEntry() {
  const [email, setEmail] = useState('')

  useEffect(() => {
    setEmail(readEmail())
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'dr-auth-email') setEmail(readEmail())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  if (!email) {
    return (
      <Button asChild size="sm" variant="secondary">
        <Link href="/add">Log in to manage billing</Link>
      </Button>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button asChild size="sm" variant="secondary">
        <Link href="/billing">View billing status</Link>
      </Button>
      <BillingPortalButton email={email} />
    </div>
  )
}
