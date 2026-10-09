import { Card, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const CARDS = ['c1', 'c2', 'c3', 'c4']
const ROWS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']

// Moving between account pages: the heading, cards and table rows as placeholders while the
// page loads its data.
export default function AccountLoading() {
  return (
    <div className="flex flex-col gap-4 md:gap-6" aria-busy="true">
      <span className="sr-only" role="status">
        Loading
      </span>
      <div className="flex flex-col gap-2 px-4 lg:px-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
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
