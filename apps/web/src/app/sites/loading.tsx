import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const ROWS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8']

export default function LoadingSitesPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-8 px-4 py-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Top Sites</h1>
        <p className="text-muted-foreground">Browse sites and their current Domain Rating.</p>
      </div>

      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-8 w-full sm:w-[320px]" />
        </div>

        <Card className="gap-0 px-4">
          {ROWS.map(key => (
            <div key={key} className="flex items-center gap-6 border-b py-3 last:border-b-0">
              <Skeleton className="h-4 w-6" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-8" />
            </div>
          ))}
        </Card>
      </div>
    </main>
  )
}
