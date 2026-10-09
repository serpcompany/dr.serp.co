'use client'

import { ArrowUpRightIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { type PlanChoice, PRICING_TIERS } from '@/lib/pricing'
import { changePlan, startCheckout } from './actions'
import { PlanPicker } from './plan-picker'

function priceOf(choice: PlanChoice): number {
  const tier = PRICING_TIERS.find(candidate => candidate.domains === choice.domains)
  return tier ? tier[choice.billing] : 0
}

function priceLabel(choice: PlanChoice): string {
  return `$${priceOf(choice)} a ${choice.billing === 'annual' ? 'year' : 'month'}`
}

const sameChoice = (a: PlanChoice | null, b: PlanChoice | null) =>
  a !== null && b !== null && a.domains === b.domains && a.billing === b.billing

/**
 * What Stripe does on a switch (change-plan uses proration_behavior always_invoice). Within a
 * billing period it charges or credits the difference for the rest of the period; between
 * monthly and yearly it restarts the billing period today and charges the new price at once.
 */
function switchTerms(current: PlanChoice, next: PlanChoice): string {
  if (current.billing !== next.billing) {
    return `Your billing restarts today, ${next.billing === 'annual' ? 'yearly' : 'monthly'}: Stripe charges $${priceOf(next)} now, less a credit for the unused part of your current plan. Your sites stay claimed.`
  }
  return priceOf(next) >= priceOf(current)
    ? 'Stripe charges the difference for the rest of this period today, on the card you pay with. Your sites stay claimed.'
    : 'Stripe credits the difference for the rest of this period to your next invoice. Your sites stay claimed.'
}

/**
 * The billing page's plan card (#140 mockups, Billing): choose a size and period, then check out
 * (no plan yet) or switch the live plan after a confirm that says what Stripe charges.
 */
export function PlanChooser({
  mode,
  current,
  initial,
  claimed,
  blocked
}: {
  mode: 'checkout' | 'change'
  current: PlanChoice | null
  initial: PlanChoice
  /** Sites claimed now; a smaller plan can't hold them. */
  claimed: number
  /** Why the plan can't change right now (an unpaid invoice), or null. */
  blocked?: string | null
}) {
  const router = useRouter()
  const [choice, setChoice] = useState<PlanChoice>(initial)
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A switch Stripe accepted, until the webhook has set it and the page shows it as current.
  const [switchedTo, setSwitchedTo] = useState<PlanChoice | null>(null)
  const settled = sameChoice(switchedTo, current)
  const same = sameChoice(current, choice)
  // As change-plan refuses: a smaller size than the sites already claimed.
  const tooSmall =
    mode === 'change' &&
    current !== null &&
    choice.domains < current.domains &&
    claimed > choice.domains

  useEffect(() => {
    if (!switchedTo) return undefined
    if (settled) {
      setSwitchedTo(null)
      return undefined
    }
    // Read the page again until the webhook's plan shows, for about half a minute.
    const timers = [2_000, 5_000, 10_000, 20_000, 30_000].map(ms =>
      window.setTimeout(() => router.refresh(), ms)
    )
    return () => {
      for (const timer of timers) window.clearTimeout(timer)
    }
  }, [switchedTo, settled, router])

  async function checkout() {
    setPending(true)
    setError(null)
    const result = await startCheckout(choice)
    if (result.ok) {
      window.location.assign(result.url)
      return
    }
    setPending(false)
    setError(result.message)
    // A plan that started elsewhere (another tab, or the webhook just now): show it.
    if (result.code === 'has_plan') router.refresh()
  }

  async function confirmChange() {
    setPending(true)
    setError(null)
    const result = await changePlan(choice)
    setPending(false)
    setConfirming(false)
    if (result.ok) {
      toast.success(`Switched to ${choice.domains} sites, ${priceLabel(choice)}.`)
      setSwitchedTo(choice)
      router.refresh()
    } else {
      setError(result.message)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === 'checkout' ? 'Choose a plan' : 'Change plan'}</CardTitle>
        <CardDescription>
          {mode === 'checkout'
            ? 'Claimed sites get a dofollow link from their dr.serp.co page and their full DR history. Cancel any time in Stripe.'
            : `Moving up charges the difference today; moving down credits it to your next invoice. Switching between monthly and yearly restarts your billing today. You can't move below the ${claimed} ${claimed === 1 ? 'site' : 'sites'} you've claimed.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <PlanPicker value={choice} onChange={setChoice} current={current} />
        {switchedTo && !settled ? (
          <Alert>
            <AlertDescription>
              Switching to {switchedTo.domains} sites, {priceLabel(switchedTo)}. Your plan updates
              here once Stripe confirms it, usually within a minute.
            </AlertDescription>
          </Alert>
        ) : null}
        {blocked ? (
          <Alert>
            <AlertDescription>{blocked}</AlertDescription>
          </Alert>
        ) : null}
        {tooSmall ? (
          <Alert>
            <AlertDescription>
              You've claimed {claimed} sites. Release some under Sites before choosing{' '}
              {choice.domains}.
            </AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-3">
        {mode === 'checkout' ? (
          <>
            <span className="text-sm text-muted-foreground">
              You'll pay on Stripe's checkout page.
            </span>
            <Button disabled={pending} onClick={() => void checkout()}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              Continue to checkout
              {pending ? null : <ArrowUpRightIcon data-icon="inline-end" />}
            </Button>
          </>
        ) : (
          <Button
            className="ml-auto"
            disabled={
              same || tooSmall || Boolean(blocked) || pending || Boolean(switchedTo && !settled)
            }
            onClick={() => setConfirming(true)}
          >
            {same ? 'Pick a different plan' : `Switch to ${choice.domains} sites`}
          </Button>
        )}
      </CardFooter>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Switch to {choice.domains} sites for {priceLabel(choice)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {current ? switchTerms(current, choice) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={event => {
                event.preventDefault()
                void confirmChange()
              }}
            >
              {pending ? <Spinner data-icon="inline-start" /> : null}
              Switch plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
