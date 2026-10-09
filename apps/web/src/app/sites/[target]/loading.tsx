import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function LoadingSitePage() {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
      <div className="space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-72 max-w-full" />
        <p className="max-w-2xl text-sm text-muted-foreground">
          Loading site details and badge preview.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader className="items-center">
            <CardTitle>Domain Rating</CardTitle>
          </CardHeader>
          <CardContent>
            <Skeleton className="mx-auto size-48 rounded-full" />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Embed Badge</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <Skeleton className="h-[50px] w-[200px]" />
            <Skeleton className="h-4 w-56" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>DR over time</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[125px] w-full" />
        </CardContent>
      </Card>
    </main>
  )
}
