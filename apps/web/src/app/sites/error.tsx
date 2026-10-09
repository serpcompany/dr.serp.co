'use client'

import { TriangleAlertIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty'

export default function SitesError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <Card>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TriangleAlertIcon />
            </EmptyMedia>
            <EmptyTitle>Something went wrong</EmptyTitle>
            <EmptyDescription>The sites list didn't load.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={reset}>Try again</Button>
          </EmptyContent>
        </Empty>
      </Card>
    </main>
  )
}
