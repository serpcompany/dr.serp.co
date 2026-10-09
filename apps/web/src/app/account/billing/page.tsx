import { AlertCircleIcon, ArrowUpRightIcon, CircleCheckIcon, ClockIcon } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/account/page-header'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { ChangePlanDialog } from '../_mock/change-plan-dialog'
import { PLAN, SITES, stateOf } from '../_mock/data'
import { PlanPicker } from '../_mock/plan-picker'

// Status chips follow dashboard-01: an outline Badge with a coloured lucide icon.
const STATUS: Record<string, { label: string; icon: React.ReactNode }> = {
  '': { label: 'Active', icon: <CircleCheckIcon className="text-primary" /> },
  change: { label: 'Active', icon: <CircleCheckIcon className="text-primary" /> },
  'past-due': { label: 'Past due', icon: <AlertCircleIcon className="text-destructive" /> },
  canceled: { label: 'Ends Nov 9', icon: <ClockIcon /> }
}

export default async function AccountBilling({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const state = await stateOf(searchParams)

  if (state === 'free') {
    return (
      <>
        <PageHeader
          title="Billing"
          description="You're on the free plan. Pick a plan to claim your sites."
        />
        <div className="flex max-w-3xl flex-col gap-4 px-4 lg:px-6">
          <Card>
            <CardHeader>
              <CardTitle>Choose a plan</CardTitle>
              <CardDescription>
                Claimed sites get a dofollow link from their dr.serp.co page, weekly DR checks and
                their full DR history. Cancel any time in Stripe.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PlanPicker selected="25" />
            </CardContent>
            <CardFooter className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">
                You'll pay on Stripe's checkout page.
              </span>
              <Button>
                Continue to checkout
                <ArrowUpRightIcon />
              </Button>
            </CardFooter>
          </Card>
        </div>
      </>
    )
  }

  const status = STATUS[state] ?? STATUS['']
  return (
    <>
      <PageHeader
        title="Billing"
        description="Your plan, what it costs and what it covers. Stripe keeps your card and invoices."
      />
      <div className="flex max-w-3xl flex-col gap-4 px-4 lg:px-6">
        {state === 'past-due' ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Your last payment failed</AlertTitle>
            <AlertDescription>
              Stripe will try again on Oct 12. Update your card to keep your 25-site plan.
            </AlertDescription>
            <AlertAction>
              <Button size="sm" variant="outline">
                Update card
              </Button>
            </AlertAction>
          </Alert>
        ) : null}
        {state === 'canceled' ? (
          <Alert>
            <ClockIcon />
            <AlertTitle>Your plan ends on {PLAN.renews}</AlertTitle>
            <AlertDescription>
              Until then nothing changes. After it, your {SITES.length} sites are released and link
              nofollow.
            </AlertDescription>
            <AlertAction>
              <Button size="sm" variant="outline">
                Keep my plan
              </Button>
            </AlertAction>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardDescription>Current plan</CardDescription>
            <CardTitle className="text-2xl">{PLAN.name}</CardTitle>
            <CardAction>
              <Badge variant="outline" className="px-1.5 text-muted-foreground">
                {status.icon}
                {status.label}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Price</dt>
                <dd className="font-medium">
                  {PLAN.price} a {PLAN.period}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  {state === 'canceled' ? 'Ends' : 'Renews'}
                </dt>
                <dd className="font-medium">{PLAN.renews}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Payment method</dt>
                <dd className="font-medium">{PLAN.card}</dd>
              </div>
            </dl>
            <Separator />
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-sm">
                <span>Claimed sites</span>
                <span className="tabular-nums text-muted-foreground">
                  {SITES.length} of {PLAN.domains}
                </span>
              </div>
              <Progress value={(SITES.length / PLAN.domains) * 100} aria-label="Claimed sites" />
            </div>
          </CardContent>
          <CardFooter className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              Invoices, card and cancellation are in Stripe.
            </span>
            <Button variant="outline">
              Manage in Stripe
              <ArrowUpRightIcon />
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change plan</CardTitle>
            <CardDescription>
              Moving up charges the difference today; moving down credits it to your next invoice.
              You can't move below the {SITES.length} sites you've claimed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlanPicker current="25" selected={state === 'change' ? '50' : '25'} />
          </CardContent>
          <CardFooter className="justify-end">
            <Link
              href="/account/billing?state=change"
              className={cn(
                buttonVariants(),
                state === 'change' ? '' : 'pointer-events-none opacity-50'
              )}
              aria-disabled={state !== 'change'}
            >
              {state === 'change' ? 'Switch to 50 sites' : 'Pick a different plan'}
            </Link>
          </CardFooter>
        </Card>
        {state === 'change' ? <ChangePlanDialog /> : null}
      </div>
    </>
  )
}
