import { AlertCircleIcon, CircleCheckIcon, ClockIcon } from 'lucide-react'
import { PageHeader } from '@/components/account/page-header'
import { PlanChooser } from '@/components/account/plan-chooser'
import { PortalButton } from '@/components/account/portal-button'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
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
import { type AccountPlan, planName } from '@/lib/account'
import { type PlanChoice, planFromSearch } from '@/lib/pricing'
import { requireAccount } from '@/server/account'
import { cardOf } from '@/server/billing'

export const dynamic = 'force-dynamic'

const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/** What Stripe Checkout came back with (`?checkout=success|cancelled`). */
function CheckoutNotice({ outcome, pending }: { outcome: string | undefined; pending: boolean }) {
  if (outcome === 'cancelled') {
    return (
      <Alert>
        <AlertCircleIcon />
        <AlertTitle>Checkout cancelled</AlertTitle>
        <AlertDescription>Nothing was charged. Pick a plan when you're ready.</AlertDescription>
      </Alert>
    )
  }
  if (outcome !== 'success') return null
  // Stripe's webhook sets the plan; it usually lands within seconds of the redirect.
  return pending ? (
    <Alert>
      <ClockIcon />
      <AlertTitle>Payment received</AlertTitle>
      <AlertDescription>
        Your plan shows here once Stripe confirms it, usually within a minute. Reload to check.
      </AlertDescription>
    </Alert>
  ) : (
    <Alert>
      <CircleCheckIcon className="text-primary" />
      <AlertTitle>You're subscribed</AlertTitle>
      <AlertDescription>Claim your sites under Sites.</AlertDescription>
    </Alert>
  )
}

// Status chips follow dashboard-01: an outline Badge with a coloured lucide icon.
function StatusChip({ plan }: { plan: AccountPlan }) {
  const [icon, label] =
    plan.kind === 'past-due'
      ? [<AlertCircleIcon key="icon" className="text-destructive" />, 'Past due']
      : plan.kind === 'ending'
        ? [<ClockIcon key="icon" />, 'Ending']
        : [<CircleCheckIcon key="icon" className="text-primary" />, 'Active']
  return (
    <Badge variant="outline" className="px-1.5 text-muted-foreground">
      {icon}
      {label}
    </Badge>
  )
}

export default async function AccountBilling({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const asked = planFromSearch(params)
  const query = asked ? `?plan=${asked.domains}&period=${asked.billing}` : ''
  const account = await requireAccount(`/account/billing${query}`)
  const { plan } = account
  const claimed = account.sites.length
  const checkout = typeof params.checkout === 'string' ? params.checkout : undefined

  if (plan.kind === 'free') {
    return (
      <>
        <PageHeader
          title="Billing"
          description="You're on the free plan. Pick a plan to claim your sites."
        />
        <div className="flex max-w-3xl flex-col gap-4 px-4 lg:px-6">
          <CheckoutNotice outcome={checkout} pending />
          <PlanChooser
            mode="checkout"
            current={null}
            initial={asked ?? { domains: 25, billing: 'monthly' }}
            claimed={claimed}
          />
        </div>
      </>
    )
  }

  const card = await cardOf(account.email)
  const periodEnd = plan.periodEnd ? DATE.format(new Date(plan.periodEnd)) : null
  const current: PlanChoice | null =
    plan.domains !== null && plan.interval
      ? { domains: plan.domains, billing: plan.interval }
      : null

  return (
    <>
      <PageHeader
        title="Billing"
        description="Your plan, what it costs and what it covers. Stripe keeps your card and invoices."
      />
      <div className="flex max-w-3xl flex-col gap-4 px-4 lg:px-6">
        <CheckoutNotice outcome={checkout} pending={false} />
        {plan.kind === 'past-due' ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Your last payment failed</AlertTitle>
            <AlertDescription>
              Stripe will try again. Update your card to keep your {planName(plan)} plan.
            </AlertDescription>
            <AlertAction>
              <PortalButton size="sm">Update card</PortalButton>
            </AlertAction>
          </Alert>
        ) : null}
        {plan.kind === 'ending' ? (
          <Alert>
            <ClockIcon />
            <AlertTitle>Your plan ends{periodEnd ? ` on ${periodEnd}` : ''}</AlertTitle>
            <AlertDescription>
              Until then nothing changes. After it, your {claimed}{' '}
              {claimed === 1 ? 'site is' : 'sites are'} released and link nofollow.
            </AlertDescription>
            <AlertAction>
              <PortalButton size="sm">Keep my plan</PortalButton>
            </AlertAction>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardDescription>Current plan</CardDescription>
            <CardTitle className="text-2xl">{planName(plan)}</CardTitle>
            <CardAction>
              <StatusChip plan={plan} />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Price</dt>
                <dd className="font-medium">
                  {plan.price !== null
                    ? `$${plan.price} a ${plan.interval === 'annual' ? 'year' : 'month'}`
                    : 'Paid plan'}
                </dd>
              </div>
              {periodEnd ? (
                <div>
                  <dt className="text-muted-foreground">
                    {plan.kind === 'ending' ? 'Ends' : 'Renews'}
                  </dt>
                  <dd className="font-medium">{periodEnd}</dd>
                </div>
              ) : null}
              {card ? (
                <div>
                  <dt className="text-muted-foreground">Payment method</dt>
                  <dd className="font-medium">{card}</dd>
                </div>
              ) : null}
            </dl>
            {plan.domains !== null ? (
              <>
                <Separator />
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-sm">
                    <span>Claimed sites</span>
                    <span className="tabular-nums text-muted-foreground">
                      {claimed} of {plan.domains}
                    </span>
                  </div>
                  <Progress
                    value={Math.min(100, (claimed / plan.domains) * 100)}
                    aria-label="Claimed sites"
                  />
                </div>
              </>
            ) : null}
          </CardContent>
          <CardFooter className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              Invoices, card and cancellation are in Stripe.
            </span>
            <PortalButton />
          </CardFooter>
        </Card>

        {current ? (
          <PlanChooser
            mode="change"
            current={current}
            initial={asked ?? current}
            claimed={claimed}
            blocked={
              plan.kind === 'past-due'
                ? 'Your plan has an unpaid invoice. Update your card above, then switch.'
                : null
            }
          />
        ) : null}
      </div>
    </>
  )
}
