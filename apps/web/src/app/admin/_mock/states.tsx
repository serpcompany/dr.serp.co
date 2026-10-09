'use client'

import { SearchXIcon, TriangleAlertIcon } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'

export type MockState = 'ready' | 'empty' | 'loading' | 'error'

export function useMockState(): MockState {
  const state = useSearchParams()?.get('state')
  return state === 'empty' || state === 'loading' || state === 'error' ? state : 'ready'
}

export function TableSkeleton({ rows = 6, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="grid">
      {Array.from({ length: rows }, (_, row) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
        <div key={row} className="flex items-center gap-6 border-b py-3 last:border-b-0">
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton
              // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder cells
              key={column}
              className={column === 0 ? 'h-4 flex-1' : 'h-4 w-16'}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function LoadError({ what }: { what: string }) {
  return (
    <Alert variant="destructive">
      <TriangleAlertIcon />
      <AlertTitle>{what} didn't load</AlertTitle>
      <AlertDescription>D1 returned an error. Nothing was changed.</AlertDescription>
      <AlertAction>
        <Button variant="outline" size="xs">
          Retry
        </Button>
      </AlertAction>
    </Alert>
  )
}

export function NoResults({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchXIcon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  )
}
