'use client'

import { ArrowUpRightIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
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
  const same =
    current !== null && current.domains === choice.domains && current.billing === choice.billing
  const tooSmall = choice.domains < claimed
  const upgrade = current === null || priceOf(choice) >= priceOf(current)

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
  }

  async function confirmChange() {
    setPending(true)
    setError(null)
    const result = await changePlan(choice)
    setPending(false)
    setConfirming(false)
    if (result.ok) {
      toast.success(`Switched to ${choice.domains} sites, ${priceLabel(choice)}.`)
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
            : `Moving up charges the difference today; moving down credits it to your next invoice. You can't move below the ${claimed} ${claimed === 1 ? 'site' : 'sites'} you've claimed.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <PlanPicker value={choice} onChange={setChoice} current={current} />
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
            disabled={same || tooSmall || Boolean(blocked) || pending}
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
              {upgrade
                ? 'Stripe charges the difference for the rest of this period today, on the card you pay with. Your sites stay claimed.'
                : 'Stripe credits the difference for the rest of this period to your next invoice. Your sites stay claimed.'}
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
