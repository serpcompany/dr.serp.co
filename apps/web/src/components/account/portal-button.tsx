'use client'

import { ArrowUpRightIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { openPortal } from './actions'

/** Opens Stripe's billing portal (invoices, the card, cancellation). */
export function PortalButton({
  children = 'Manage in Stripe',
  variant = 'outline',
  size = 'default'
}: {
  children?: React.ReactNode
  variant?: 'outline' | 'default'
  size?: 'default' | 'sm'
}) {
  const [pending, setPending] = useState(false)
  return (
    <Button
      variant={variant}
      size={size}
      disabled={pending}
      onClick={async () => {
        setPending(true)
        const result = await openPortal()
        if (result.ok) {
          window.location.assign(result.url)
          return
        }
        setPending(false)
        toast.error(result.message)
      }}
    >
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {children}
      {pending ? null : <ArrowUpRightIcon data-icon="inline-end" />}
    </Button>
  )
}
