import { AlertCircleIcon, CircleCheckIcon, ClockIcon } from 'lucide-react'
import { PageHeader } from '@/components/account/page-header'
import { PlanChooser } from '@/components/account/plan-chooser'
import { PortalButton } from '@/components/account/portal-button'
import { RefreshButton } from '@/components/account/refresh-button'
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
import { type Account, type AccountPlan, planName } from '@/lib/account'
import type { PlanChoice } from '@/lib/pricing'
import { cardOf } from '@/server/billing'

// The billing page's states (#140 mockups, Billing), by the account's plan.

const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
export const BILLING_TITLE = 'Billing'

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

function sitesCount(count: number) {
  return `${count} ${count === 1 ? 'site' : 'sites'}`
}

/** No plan: choose one and check out, or wait for a payment Stripe hasn't confirmed yet. */
export function FreeBilling({
  account,
  asked,
  checkout
}: {
  account: Account
  asked: PlanChoice | null
  checkout: string | undefined
}) {
  // Back from Checkout before Stripe's webhook has set the plan. No chooser here: a second
  // checkout now would start a second subscription.
  if (checkout === 'success') {
    return (
      <>
        <PageHeader
          title={BILLING_TITLE}
          description="Your payment went through. Your plan is on its way."
        />
        <div className="flex max-w-3xl flex-col gap-4 px-4 lg:px-6">
          <Alert>
            <ClockIcon />
            <AlertTitle>Payment received</AlertTitle>
            <AlertDescription>
              Your plan shows here once Stripe confirms it, usually within a minute.
            </AlertDescription>
            <AlertAction>
              <RefreshButton />
            </AlertAction>
          </Alert>
        </div>
      </>
    )
  }
  return (
    <>
      <PageHeader
        title={BILLING_TITLE}
        description="You're on the free plan. Pick a plan to claim your sites."
      />
      <div className="flex max-w-3xl flex-col gap-4 px-4 lg:px-6">
        {checkout === 'cancelled' ? (
          <Alert>
            <AlertCircleIcon />
            <AlertTitle>Checkout cancelled</AlertTitle>
            <AlertDescription>Nothing was charged. Pick a plan when you're ready.</AlertDescription>
          </Alert>
        ) : null}
        <PlanChooser
          mode="checkout"
          current={null}
          initial={asked ?? { domains: 25, billing: 'monthly' }}
          claimed={account.sites.length}
        />
        {/* A lapsed subscriber's earlier invoices. */}
        {account.plan.portal ? (
          <Card>
            <CardHeader>
              <CardTitle>Past invoices</CardTitle>
              <CardDescription>
                Your earlier plan's invoices and receipts are in Stripe.
              </CardDescription>
              <CardAction>
                <PortalButton size="sm">Open in Stripe</PortalButton>
              </CardAction>
            </CardHeader>
          </Card>
        ) : null}
      </div>
    </>
  )
}

/** A plan: what it is and costs, its alerts, and changing it (or buying again once canceled). */
export async function PlanBilling({
  account,
  asked,
  checkout
}: {
  account: Account
  asked: PlanChoice | null
  checkout: string | undefined
}) {
  const { plan } = account
  const claimed = account.sites.length
  const unlimited = plan.domains === null
  // Stripe only when it bills this account: no call for an internal account or a canceled plan.
  const card = plan.live ? await cardOf(account.email) : null
  const periodEnd = plan.periodEnd ? DATE.format(new Date(plan.periodEnd)) : null
  const current: PlanChoice | null =
    plan.domains !== null && plan.interval
      ? { domains: plan.domains, billing: plan.interval }
      : null

  return (
    <>
      <PageHeader
        title={BILLING_TITLE}
        description={
          unlimited
            ? 'An internal account: unlimited sites, nothing to pay.'
            : 'Your plan, what it costs and what it covers. Stripe keeps your card and invoices.'
        }
      />
      <div className="flex max-w-3xl flex-col gap-4 px-4 lg:px-6">
        {checkout === 'success' ? (
          <Alert>
            <CircleCheckIcon className="text-primary" />
            <AlertTitle>You're subscribed</AlertTitle>
            <AlertDescription>Claim your sites under Sites.</AlertDescription>
          </Alert>
        ) : null}
        {plan.kind === 'past-due' ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Your last payment failed</AlertTitle>
            <AlertDescription>
              Stripe will try again. Update your card to keep your {planName(plan)} plan.
            </AlertDescription>
            {plan.portal ? (
              <AlertAction>
                <PortalButton size="sm">Update card</PortalButton>
              </AlertAction>
            ) : null}
          </Alert>
        ) : null}
        {plan.kind === 'ending' ? (
          <Alert>
            <ClockIcon />
            <AlertTitle>Your plan ends{periodEnd ? ` on ${periodEnd}` : ''}</AlertTitle>
            <AlertDescription>
              Until then nothing changes. After it, your {sitesCount(claimed)} stay claimed, but
              their links go nofollow and they're rechecked monthly instead of weekly.
            </AlertDescription>
            {plan.live ? (
              <AlertAction>
                <PortalButton size="sm">Keep my plan</PortalButton>
              </AlertAction>
            ) : null}
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
                  {unlimited
                    ? 'No charge'
                    : plan.price !== null
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
          {plan.portal ? (
            <CardFooter className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">
                Invoices, card and cancellation are in Stripe.
              </span>
              <PortalButton />
            </CardFooter>
          ) : null}
        </Card>

        {plan.live && current ? (
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
        {/* Canceled, still in its paid period: nothing to change, but a new plan can start. */}
        {!plan.live && !unlimited ? (
          <PlanChooser
            mode="checkout"
            current={null}
            initial={asked ?? current ?? { domains: 25, billing: 'monthly' }}
            claimed={claimed}
          />
        ) : null}
      </div>
    </>
  )
}
