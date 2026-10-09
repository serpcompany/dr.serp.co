'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { BillingPortalButton } from '@/app/_components/billing-portal-button'
import { buttonVariants } from '@/components/ui/button'

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
      <Link href="/add" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
        Log in to manage billing
      </Link>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Link href="/billing" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
        View billing status
      </Link>
      <BillingPortalButton email={email} />
    </div>
  )
}
