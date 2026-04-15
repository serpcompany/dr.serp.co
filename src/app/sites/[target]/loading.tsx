export default function LoadingSitePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 space-y-3">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-9 w-72 animate-pulse rounded bg-muted" />
        <p className="max-w-2xl text-sm text-muted-foreground">
          Checking domain rating and loading the badge preview. This can take up to a minute for a fresh lookup.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-lg border bg-card p-6">
          <div className="mx-auto h-56 w-56 animate-pulse rounded-full bg-muted" />
        </div>

        <div className="rounded-lg border bg-card p-6 lg:col-span-2">
          <div className="flex flex-col items-center gap-4">
            <div className="h-[50px] w-[200px] animate-pulse rounded bg-muted" />
            <div className="h-4 w-56 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-lg border bg-card p-6">
        <div className="h-48 animate-pulse rounded bg-muted" />
      </div>
    </div>
  )
}
