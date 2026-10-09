import { GlobeIcon, PlusIcon } from 'lucide-react'
import Link from 'next/link'
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

/** Empty inside a Card, under the page heading (account-dashboard.md § UI rules). */
export function NoSites() {
  return (
    <Card>
      <CardContent>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GlobeIcon />
            </EmptyMedia>
            <EmptyTitle>No sites yet</EmptyTitle>
            <EmptyDescription>
              Claim a site to give it a dofollow link and keep its full DR history.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link href="/account/sites?add=1" className={cn(buttonVariants())}>
              <PlusIcon />
              Add your first site
            </Link>
          </EmptyContent>
        </Empty>
      </CardContent>
    </Card>
  )
}
