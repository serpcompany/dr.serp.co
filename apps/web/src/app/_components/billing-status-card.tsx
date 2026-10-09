'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { BillingPortalButton } from '@/app/_components/billing-portal-button'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { readJsonRecord } from '@/lib/read-json'

type Entitlement = {
  status: string
  canAccessPaidFeatures: boolean
  canClaim: boolean
  domainsLimit: number | null
  domainsUsed: number
  remaining: number | null
  isUnlimited?: boolean
  hasLivePlan?: boolean
  subscription: {
    stripeCustomerId: string | null
    stripeSubscriptionId: string | null
    billingInterval: string | null
    domainsLimit: number | null
    status: string | null
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean | null
  } | null
}

function readEmail() {
  return window.localStorage.getItem('dr-auth-email')?.trim().toLowerCase() || ''
}

function formatDate(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date)
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  trialing: 'Trialing',
  grace: 'In grace period',
  past_due: 'Past due',
  canceled: 'Canceled',
  inactive: 'Inactive',
  none: 'No subscription'
}

export function BillingStatusCard() {
  const [email, setEmail] = useState('')
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setEmail(readEmail())
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'dr-auth-email') setEmail(readEmail())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    if (!email) {
      setEntitlement(null)
      setError(null)
      return
    }

    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch('/api/billing/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
          signal: controller.signal
        })
        const payload = await readJsonRecord(response)
        if (!response.ok) {
          throw new Error(
            typeof payload?.error === 'string' ? payload.error : 'Unable to load billing status.'
          )
        }
        setEntitlement(payload?.entitlement ?? null)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Unable to load billing status.')
      } finally {
        setLoading(false)
      }
    }

    load()
    return () => controller.abort()
  }, [email])

  const statusLabel = entitlement
    ? STATUS_LABELS[entitlement.status] || 'Unknown'
    : 'No subscription'
  const renewalDate = formatDate(entitlement?.subscription?.currentPeriodEnd ?? null)

  const planLabel = useMemo(() => {
    if (!entitlement) return 'Free'
    if (entitlement.isUnlimited) return 'Unlimited domains'
    if (!entitlement.domainsLimit) return 'Free'
    return `${entitlement.domainsLimit} domains`
  }, [entitlement])

  const billingLabel = entitlement?.subscription?.billingInterval
    ? entitlement.subscription.billingInterval === 'annual'
      ? 'Annual'
      : 'Monthly'
    : null

  const renewalLabel = entitlement?.subscription?.cancelAtPeriodEnd ? 'Ends on' : 'Renews on'

  if (!email) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
          <CardDescription>Sign in to see your plan details.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/add" className={buttonVariants({ size: 'sm' })}>
            Log in
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing</CardTitle>
        <CardDescription>Plan, renewal, and payment status for {email}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="grid gap-2 text-sm text-muted-foreground">
            <div className="h-4 w-40 animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-56 animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-32 animate-pulse rounded-md bg-muted" />
          </div>
        ) : error ? (
          <div className="rounded-lg border bg-muted p-4 text-sm text-muted-foreground">
            {error}
          </div>
        ) : (
          <div className="grid gap-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-foreground">Plan</p>
                <p className="text-muted-foreground">
                  {planLabel}
                  {billingLabel ? ` • ${billingLabel}` : ''}
                </p>
              </div>
              <Badge variant={entitlement?.canAccessPaidFeatures ? 'secondary' : 'outline'}>
                {statusLabel}
              </Badge>
            </div>
            <div>
              <p className="font-medium text-foreground">Payment status</p>
              <p className="text-muted-foreground">{statusLabel}</p>
            </div>
            <div>
              <p className="font-medium text-foreground">{renewalLabel}</p>
              <p className="text-muted-foreground">{renewalDate || '—'}</p>
            </div>
            <div>
              <p className="font-medium text-foreground">Domains used</p>
              <p className="text-muted-foreground">
                {entitlement?.domainsUsed ?? 0}/
                {entitlement?.isUnlimited ? 'Unlimited' : (entitlement?.domainsLimit ?? 0)}
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {entitlement?.subscription?.stripeCustomerId ? (
            <BillingPortalButton email={email} />
          ) : entitlement?.isUnlimited ? null : (
            <Link href="/pricing" className={buttonVariants({ size: 'sm' })}>
              View plans
            </Link>
          )}
          {/* A plan on hold is paid through Manage billing, not bought again. */}
          {entitlement && !entitlement.canAccessPaidFeatures && !entitlement.hasLivePlan ? (
            <Link href="/pricing" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Upgrade
            </Link>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
