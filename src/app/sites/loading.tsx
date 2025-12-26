export default function LoadingSitesPage() {
  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="mb-8 text-center">
          <div className="mx-auto h-8 w-48 animate-pulse rounded bg-muted" />
        </div>
        <div className="rounded-lg border bg-background">
          <div className="border-b p-4">
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
          </div>
          <div className="p-6">
            <div className="space-y-3">
              <div className="h-10 w-full animate-pulse rounded bg-muted" />
              <div className="h-10 w-full animate-pulse rounded bg-muted" />
              <div className="h-10 w-full animate-pulse rounded bg-muted" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

