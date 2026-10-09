import { SparklesIcon } from 'lucide-react'
import Link from 'next/link'
import { Suspense } from 'react'
import { DrChart } from '@/components/account/dr-chart'
import { PageHeader } from '@/components/account/page-header'
import { PageLoading } from '@/components/account/page-loading'
import { SectionCards } from '@/components/account/section-cards'
import { SitesTable } from '@/components/account/sites-table'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty'
import { cn } from '@/lib/utils'
import { requireAccount, requireSignIn } from '@/server/account'
import { badgeUrls } from './badge-urls'
import { NoSites } from './no-sites'

export const dynamic = 'force-dynamic'

const TITLE = 'Overview'
const DESCRIPTION = 'Your claimed sites, their DR and your plan.'

// dashboard-01's page: the cards, the chart and the table, under the page heading. Signed out, a
// 307 to /login before anything streams. A first visit renders whole on the server (the layout
// loads the account for the sidebar); moving here from another account page shows the skeleton.
export default async function AccountOverview() {
  await requireSignIn('/account')
  return (
    <Suspense fallback={<PageLoading title={TITLE} description={DESCRIPTION} cards />}>
      <Overview />
    </Suspense>
  )
}

async function Overview() {
  const account = await requireAccount('/account')
  const free = account.plan.kind === 'free' && account.sites.length === 0
  return (
    <>
      <PageHeader title={TITLE} description={DESCRIPTION} />
      <SectionCards account={account} />
      {free ? (
        <div className="px-4 lg:px-6">
          <Card>
            <CardContent>
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <SparklesIcon />
                  </EmptyMedia>
                  <EmptyTitle>Claim your sites with a plan</EmptyTitle>
                  <EmptyDescription>
                    Claimed sites get a dofollow link from their dr.serp.co page and their full DR
                    history. Plans start at $4 a month for 12 sites.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Link href="/pricing" className={cn(buttonVariants())}>
                    See plans
                  </Link>
                </EmptyContent>
              </Empty>
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          {account.average.length > 1 ? (
            <div className="px-4 lg:px-6">
              <DrChart data={account.average} />
            </div>
          ) : null}
          <SitesTable
            data={account.sites}
            urls={badgeUrls()}
            dofollow={account.plan.paid}
            empty={<NoSites />}
          />
        </>
      )}
    </>
  )
}
