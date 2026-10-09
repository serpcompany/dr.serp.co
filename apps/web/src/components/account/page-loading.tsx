import { Card, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from './page-header'

const CARDS = ['c1', 'c2', 'c3', 'c4']
const ROWS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']

/**
 * An account page while its data loads (#140 mockups, the Sites loading state): its real heading,
 * then cards and table rows as placeholders. The page checks the session before showing it, so a
 * signed-out visitor is redirected (307) rather than shown this.
 */
export function PageLoading({
  title,
  description,
  cards = false
}: {
  title: string
  description: string
  /** The overview's four cards; other pages start with their table. */
  cards?: boolean
}) {
  return (
    <div className="flex flex-col gap-4 md:gap-6" aria-busy="true">
      <span className="sr-only" role="status">
        Loading
      </span>
      <PageHeader title={title} description={description} />
      {cards ? (
        <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
          {CARDS.map(key => (
            <Card key={key}>
              <CardHeader className="gap-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-16" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : null}
      <div className="px-4 lg:px-6">
        <div className="flex flex-col rounded-lg border">
          {ROWS.map(key => (
            <div key={key} className="flex items-center gap-6 border-b px-4 py-3 last:border-b-0">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
