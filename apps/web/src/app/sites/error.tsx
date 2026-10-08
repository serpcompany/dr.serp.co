'use client'

import { Button } from '@/components/ui/button'

export default function SitesError({ reset }: { reset: () => void }) {
  return (
    <div className="min-h-screen bg-muted">
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="rounded-lg border bg-background p-10 text-center">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">Unable to load the sites list.</p>
          <div className="mt-4 flex justify-center">
            <Button onClick={reset}>Try again</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
