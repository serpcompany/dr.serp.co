'use client'

import Link from 'next/link'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { PAID_FEATURES, PRICING_TIERS } from '@/lib/pricing'
import { readJsonRecord } from '@/lib/read-json'
import { cn } from '@/lib/utils'

const BILLING_LABELS = {
  monthly: 'Monthly',
  annual: 'Annual'
}

type Billing = keyof typeof BILLING_LABELS
type CurrentPlan = { domains: number; billing: Billing }

function readPlan(value: unknown): CurrentPlan | null {
  const plan = value as { domains?: unknown; billing?: unknown } | null
  const domains = Number(plan?.domains)
  const billing =
    plan?.billing === 'annual' ? 'annual' : plan?.billing === 'monthly' ? 'monthly' : null
  return Number.isFinite(domains) && domains > 0 && billing ? { domains, billing } : null
}

function describePlan(plan: CurrentPlan) {
  return `${plan.domains} domains, billed ${plan.billing === 'annual' ? 'yearly' : 'monthly'}`
}

export function PricingSelector() {
  const [tierIndex, setTierIndex] = useState(0)
  const sliderLabelId = useId()
  const [isAnnual, setIsAnnual] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A subscriber changes their plan instead of starting a second subscription (#84).
  const [currentPlan, setCurrentPlan] = useState<CurrentPlan | null>(null)
  const [changed, setChanged] = useState<CurrentPlan | null>(null)
  // A live plan waiting on an open invoice (past_due or unpaid): change-plan refuses until it's paid.
  const [onHold, setOnHold] = useState(false)

  // Start the selector on the subscriber's own plan, so nothing is one click from a downgrade.
  const showCurrentPlan = useCallback((plan: CurrentPlan | null) => {
    if (!plan) return
    setCurrentPlan(plan)
    const index = PRICING_TIERS.findIndex(item => item.domains === plan.domains)
    if (index >= 0) setTierIndex(index)
    setIsAnnual(plan.billing === 'annual')
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/billing/status', { method: 'POST', signal: controller.signal })
      .then(async response => {
        if (!response.ok) return
        const payload = await readJsonRecord(response)
        const entitlement = payload?.entitlement
        if (!entitlement?.hasLivePlan || !entitlement?.subscription) return
        setOnHold(['past_due', 'unpaid'].includes(entitlement.subscription.status))
        showCurrentPlan(
          readPlan({
            domains: entitlement.subscription.domainsLimit,
            billing: entitlement.subscription.billingInterval
          })
        )
      })
      .catch(() => {})
    return () => controller.abort()
  }, [showCurrentPlan])

  const tier = PRICING_TIERS[tierIndex]
  const price = isAnnual ? tier.annual : tier.monthly
  const priceLabel = isAnnual ? '/year' : '/month'

  const sliderValue = useMemo(() => [tierIndex], [tierIndex])

  const selectedBilling: Billing = isAnnual ? 'annual' : 'monthly'
  const isCurrentPlan =
    currentPlan?.domains === tier.domains && currentPlan?.billing === selectedBilling

  const handleChangePlan = async () => {
    setError(null)
    setIsSubmitting(true)
    try {
      const response = await fetch('/api/stripe/change-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains: tier.domains, billing: selectedBilling })
      })
      const payload = await readJsonRecord(response)
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to change your plan.')
      const plan = { domains: tier.domains, billing: selectedBilling }
      setCurrentPlan(plan)
      setChanged(plan)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to change your plan.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCheckout = async () => {
    setError(null)
    setIsSubmitting(true)

    try {
      const storedEmail =
        typeof window !== 'undefined'
          ? window.localStorage.getItem('dr-auth-email')?.trim().toLowerCase()
          : null

      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          domains: tier.domains,
          billing: isAnnual ? 'annual' : 'monthly',
          email: storedEmail || undefined
        })
      })

      if (!response.ok) {
        const payload = await readJsonRecord(response)
        // A subscriber whose plan the page didn't know yet: show it and offer the switch instead.
        const plan = payload?.code === 'has_plan' ? readPlan(payload.plan) : null
        if (plan) {
          showCurrentPlan(plan)
          return
        }
        throw new Error(payload?.error ?? 'Unable to start checkout.')
      }

      const payload = await readJsonRecord(response)
      if (!payload?.url) {
        throw new Error('Stripe checkout URL not returned.')
      }

      window.location.href = payload.url
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to start checkout.'
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2">
        <CardTitle className="text-xl">SERP DR Pro Subscription</CardTitle>
        <p className="text-sm text-muted-foreground">
          Everything you need to monitor DR across multiple domains.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p id={sliderLabelId} className="text-sm font-medium">
              How many domains do you want to monitor?
            </p>
            <p className="text-xs text-muted-foreground">Based on your selected tier.</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold">${price}</p>
            <p className="text-xs text-muted-foreground">
              {priceLabel} · {BILLING_LABELS[isAnnual ? 'annual' : 'monthly']}
              {isAnnual ? ' (2 months free)' : ''}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <Slider
            // Base UI focuses the input inside the thumb, so the stock thumb's focus-visible ring
            // never shows; ring the thumb when its input has keyboard focus.
            className="**:data-[slot=slider-thumb]:has-focus-visible:ring-3"
            aria-labelledby={sliderLabelId}
            min={0}
            max={PRICING_TIERS.length - 1}
            step={1}
            value={sliderValue}
            onValueChange={value => setTierIndex(typeof value === 'number' ? value : value[0])}
          />
          <div className="grid grid-cols-4 justify-items-center">
            {PRICING_TIERS.map((item, index) => (
              <Button
                key={item.id}
                type="button"
                variant="ghost"
                size="xs"
                aria-pressed={index === tierIndex}
                onClick={() => setTierIndex(index)}
                className={cn(
                  index === tierIndex ? 'font-semibold text-foreground' : 'text-muted-foreground'
                )}
              >
                {item.domains}
              </Button>
            ))}
          </div>
          <div className="rounded-lg border border-dashed p-3 text-sm">
            Monitor up to <span className="font-semibold">{tier.domains}</span> domains.
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
          <span
            className={cn(!isAnnual ? 'font-semibold text-foreground' : 'text-muted-foreground')}
          >
            Monthly
          </span>
          <Switch
            checked={isAnnual}
            onCheckedChange={setIsAnnual}
            aria-label="Toggle annual billing"
          />
          <span
            className={cn(isAnnual ? 'font-semibold text-foreground' : 'text-muted-foreground')}
          >
            Annual
          </span>
          <span className="text-xs text-muted-foreground">(2 months free)</span>
        </div>

        <div>
          <p className="text-sm font-medium">Included with every paid tier</p>
          <ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            {PAID_FEATURES.map(feature => (
              <li key={feature}>• {feature}</li>
            ))}
          </ul>
        </div>

        {currentPlan ? (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <p>
              Your plan: <span className="font-semibold">{describePlan(currentPlan)}</span>.
            </p>
            {onHold ? (
              <p className="mt-1 text-xs text-muted-foreground">
                It has an unpaid invoice. Pay it with Manage billing on the{' '}
                <Link href="/billing" className="underline underline-offset-4">
                  billing page
                </Link>
                , then switch.
              </p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              {isCurrentPlan
                ? 'Pick another size or billing period to switch.'
                : `Switching to ${describePlan({ domains: tier.domains, billing: selectedBilling })} changes your existing subscription. The difference is prorated and charged or credited now.`}
            </p>
          </div>
        ) : null}

        {changed ? (
          <p className="text-sm text-muted-foreground">
            Plan changed to {describePlan(changed)}. It can take a moment to show on your billing
            page.
          </p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-2">
        {currentPlan ? (
          <Button
            onClick={handleChangePlan}
            disabled={isSubmitting || isCurrentPlan || onHold}
            className="w-full"
          >
            {isSubmitting ? 'Switching plan...' : isCurrentPlan ? 'Current plan' : 'Switch plan'}
          </Button>
        ) : (
          <Button onClick={handleCheckout} disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Starting checkout...' : 'Start monitoring'}
          </Button>
        )}
        <p className="text-center text-xs text-muted-foreground">
          {currentPlan
            ? 'Your subscription is managed by Stripe.'
            : 'Secure checkout handled by Stripe.'}
        </p>
      </CardFooter>
    </Card>
  )
}
