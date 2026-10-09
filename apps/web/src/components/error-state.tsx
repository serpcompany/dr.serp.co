'use client'

import { CircleAlertIcon, RotateCwIcon } from 'lucide-react'
import { useEffect } from 'react'
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

/**
 * What an error boundary shows (account-dashboard.md: Empty inside a Card). `retry` re-fetches
 * the failed segment from the server and renders it again.
 */
export function ErrorState({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <Card>
      <CardContent>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CircleAlertIcon />
            </EmptyMedia>
            <EmptyTitle>This page couldn't load</EmptyTitle>
            <EmptyDescription>
              Something went wrong on our side. Your sites and plan are unchanged; try again in a
              moment.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => retry()}>
              <RotateCwIcon data-icon="inline-start" />
              Try again
            </Button>
          </EmptyContent>
        </Empty>
      </CardContent>
    </Card>
  )
}
