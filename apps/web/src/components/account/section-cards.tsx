import { CircleCheckIcon, SparklesIcon, TrendingUpIcon } from 'lucide-react'
import { PLAN, SITES } from '@/app/account/_mock/data'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'

// dashboard-01's SectionCards with the account's numbers.
export function SectionCards({ free = false }: { free?: boolean }) {
  const claimed = free ? 0 : SITES.length
  const rising = SITES.filter(site => site.change > 0)
  const average = Math.round(SITES.reduce((sum, site) => sum + site.dr, 0) / SITES.length)
  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Claimed sites</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {claimed}
            <span className="text-base font-normal text-muted-foreground">
              {' '}
              of {free ? 0 : PLAN.domains}
            </span>
          </CardTitle>
          <CardAction>
            <Badge variant="outline">{free ? 'No plan' : `${PLAN.domains - claimed} left`}</Badge>
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
            {free ? '—' : average}
          </CardTitle>
          {free ? null : (
            <CardAction>
              <Badge variant="outline">
                <TrendingUpIcon />
                +1
              </Badge>
            </CardAction>
          )}
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {free ? 'No sites claimed yet' : 'Up 1 since September'}
            {free ? null : <TrendingUpIcon className="size-4" />}
          </div>
          <div className="text-muted-foreground">Across your claimed sites</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Rising this month</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {free ? '—' : rising.length}
          </CardTitle>
          {free ? null : (
            <CardAction>
              <Badge variant="outline">
                <TrendingUpIcon />
                Top +3
              </Badge>
            </CardAction>
          )}
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {free ? 'Weekly checks come with a plan' : 'keybumps.com rose most'}
          </div>
          <div className="text-muted-foreground">1 fell · checked weekly, last Oct 7</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Plan</CardDescription>
          <CardTitle className="text-2xl font-semibold @[250px]/card:text-3xl">
            {free ? 'Free' : PLAN.name}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              {free ? <SparklesIcon /> : <CircleCheckIcon className="text-primary" />}
              {free ? 'Upgrade' : 'Active'}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {free ? 'Public pages and badges' : `${PLAN.price} a month`}
          </div>
          <div className="text-muted-foreground">
            {free ? 'for any site, no account needed' : `Renews ${PLAN.renews}`}
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
