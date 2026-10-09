import { SparklesIcon } from 'lucide-react'
import Link from 'next/link'
import { DrChart } from '@/components/account/dr-chart'
import { PageHeader } from '@/components/account/page-header'
import { SectionCards } from '@/components/account/section-cards'
import { SitesTable } from '@/components/account/sites-table'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty'
import { SITES, stateOf } from './_mock/data'

// dashboard-01's page: the cards, the chart and the table, under the page heading.
export default async function AccountOverview({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const free = (await stateOf(searchParams)) === 'free'
  return (
    <>
      <PageHeader title="Overview" description="Your claimed sites, their DR and your plan." />
      <SectionCards free={free} />
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
                    Claimed sites get a dofollow link from their dr.serp.co page, weekly DR checks
                    and their full DR history. Plans start at $4 a month for 12 sites.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button nativeButton={false} render={<Link href="/account/billing?state=free" />}>
                    See plans
                  </Button>
                </EmptyContent>
              </Empty>
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          <div className="px-4 lg:px-6">
            <DrChart />
          </div>
          <SitesTable data={SITES} />
        </>
      )}
    </>
  )
}
