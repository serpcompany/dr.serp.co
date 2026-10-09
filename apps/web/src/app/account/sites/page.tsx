import { AlertCircleIcon, GlobeIcon, PlusIcon } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/account/page-header'
import { SitesTable } from '@/components/account/sites-table'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { Skeleton } from '@/components/ui/skeleton'
import { AddSiteDialog } from '../_mock/add-site-dialog'
import { PLAN, SITES } from '../_mock/data'
import { ReleaseDialog } from '../_mock/release-dialog'

export default async function AccountSites({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const state = typeof params.state === 'string' ? params.state : ''
  const site = typeof params.site === 'string' ? params.site : undefined
  const sites = state === 'empty' ? [] : SITES
  return (
    <>
      <PageHeader
        title="Sites"
        description={`${sites.length} of ${PLAN.domains} claimed on your plan. Open a site for its badge and history.`}
      />
      {state === 'error' ? (
        <div className="px-4 lg:px-6">
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Your sites didn't load</AlertTitle>
            <AlertDescription>Nothing was changed. Try again in a moment.</AlertDescription>
            <AlertAction>
              <Button size="sm" variant="outline">
                Retry
              </Button>
            </AlertAction>
          </Alert>
        </div>
      ) : null}
      {state === 'loading' ? (
        <div className="flex flex-col gap-3 px-4 lg:px-6" aria-busy="true">
          <Skeleton className="h-8 w-64" />
          <div className="flex flex-col gap-2 rounded-lg border p-4">
            {['a', 'b', 'c', 'd', 'e'].map(row => (
              <Skeleton key={row} className="h-9 w-full" />
            ))}
          </div>
        </div>
      ) : (
        <SitesTable
          data={sites}
          openSite={state === '' ? site : undefined}
          empty={
            <Card>
              <CardContent>
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <GlobeIcon />
                    </EmptyMedia>
                    <EmptyTitle>No sites yet</EmptyTitle>
                    <EmptyDescription>
                      Claim a site to give it a dofollow link, weekly DR checks and its full
                      history.
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button nativeButton={false} render={<Link href="/account/sites?state=add" />}>
                      <PlusIcon />
                      Add your first site
                    </Button>
                  </EmptyContent>
                </Empty>
              </CardContent>
            </Card>
          }
        />
      )}
      {state.startsWith('add') ? <AddSiteDialog state={state} /> : null}
      {state === 'release' ? <ReleaseDialog domain={site ?? 'best.serp.co'} /> : null}
    </>
  )
}
