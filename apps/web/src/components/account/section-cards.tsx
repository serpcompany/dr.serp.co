import {
  AlertCircleIcon,
  CircleCheckIcon,
  ClockIcon,
  SparklesIcon,
  TrendingDownIcon,
  TrendingUpIcon
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { type Account, planName } from '@/lib/account'

const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function formatDate(iso: string | null): string | null {
  return iso ? DATE.format(new Date(iso)) : null
}

// dashboard-01's SectionCards with the account's numbers: claimed sites, average DR, the month's
// risers, and the plan.
export function SectionCards({ account }: { account: Account }) {
  const { plan, sites } = account
  const free = plan.kind === 'free'
  const rated = sites.filter(site => site.dr !== null)
  const average = rated.length
    ? Math.round(rated.reduce((sum, site) => sum + (site.dr ?? 0), 0) / rated.length)
    : null
  const first = account.average.at(0)?.average
  const last = account.average.at(-1)?.average
  const trend = first !== undefined && last !== undefined ? Math.round(last - first) : null
  const changed = sites.filter(site => site.change !== null)
  const rising = changed.filter(site => (site.change ?? 0) > 0)
  const falling = changed.filter(site => (site.change ?? 0) < 0)
  const top = [...rising].sort((a, b) => (b.change ?? 0) - (a.change ?? 0))[0]
  const left = plan.domains === null ? null : Math.max(0, plan.domains - sites.length)
  const periodEnd = formatDate(plan.periodEnd)

  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Claimed sites</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {sites.length}
            {plan.domains === null || free ? null : (
              <span className="text-base font-normal text-muted-foreground">
                {' '}
                of {plan.domains}
              </span>
            )}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              {free ? 'No plan' : left === null ? 'Unlimited' : `${left} left`}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {free ? 'A plan lets you claim sites' : 'Each one links dofollow'}
          </div>
          <div className="text-muted-foreground">
            {free ? 'From $4 a month for 12' : 'from its dr.serp.co page'}
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Average DR</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {average ?? '—'}
          </CardTitle>
          {trend ? (
            <CardAction>
              <Badge variant="outline">
                {trend > 0 ? <TrendingUpIcon /> : <TrendingDownIcon />}
                {trend > 0 ? `+${trend}` : trend}
              </Badge>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {average === null
              ? 'No DR yet'
              : trend
                ? `${trend > 0 ? 'Up' : 'Down'} ${Math.abs(trend)} this year`
                : 'Steady this year'}
          </div>
          <div className="text-muted-foreground">Across your claimed sites</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Rising this month</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {changed.length ? rising.length : '—'}
          </CardTitle>
          {top ? (
            <CardAction>
              <Badge variant="outline">
                <TrendingUpIcon />
                Top +{top.change}
              </Badge>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {top ? `${top.domain} rose most` : 'No changes yet'}
          </div>
          <div className="text-muted-foreground">
            {changed.length
              ? `${falling.length} fell, against a month ago`
              : 'Needs a reading from a month ago'}
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Plan</CardDescription>
          <CardTitle className="text-2xl font-semibold @[250px]/card:text-3xl">
            {planName(plan)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              {plan.kind === 'free' ? (
                <SparklesIcon />
              ) : plan.kind === 'past-due' ? (
                <AlertCircleIcon className="text-destructive" />
              ) : plan.kind === 'ending' ? (
                <ClockIcon />
              ) : (
                <CircleCheckIcon className="text-primary" />
              )}
              {plan.kind === 'free'
                ? 'Upgrade'
                : plan.kind === 'past-due'
                  ? 'Past due'
                  : plan.kind === 'ending'
                    ? 'Ending'
                    : 'Active'}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {free
              ? 'Public pages and badges'
              : plan.price !== null
                ? `$${plan.price} a ${plan.interval === 'annual' ? 'year' : 'month'}`
                : 'Paid plan'}
          </div>
          <div className="text-muted-foreground">
            {free
              ? 'for any site, no account needed'
              : periodEnd
                ? `${plan.kind === 'ending' ? 'Ends' : 'Renews'} ${periodEnd}`
                : 'Managed in Stripe'}
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
