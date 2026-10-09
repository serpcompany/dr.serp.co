'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { readJsonRecord } from '@/lib/read-json'
import { cn } from '@/lib/utils'

const SKELETON_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6']

type SiteRow = {
  domain: string
  domain_rating: number | null
  updated_at: string | null
}

function formatUpdatedAt(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date)
}

export function AllSites() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [sites, setSites] = useState<SiteRow[]>([])

  const fetchSites = useMemo(() => {
    let controller: AbortController | null = null
    const run = async () => {
      if (controller) controller.abort()
      controller = new AbortController()

      setLoading(true)
      setError(null)
      try {
        const response = await fetch('/api/sites?limit=12', { signal: controller.signal })
        const payload = await readJsonRecord(response)
        if (!response.ok) {
          throw new Error(
            typeof payload?.error === 'string' ? payload.error : 'Failed to load sites.'
          )
        }
        setTotal(Number(payload?.total) || 0)
        setSites(Array.isArray(payload?.sites) ? payload.sites : [])
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Failed to load sites.')
        setTotal(0)
        setSites([])
      } finally {
        setLoading(false)
      }
    }

    return { run, abort: () => controller?.abort() }
  }, [])

  useEffect(() => {
    fetchSites.run()
    return () => fetchSites.abort()
  }, [fetchSites])

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle>Top sites</CardTitle>
          <p className="text-xs text-muted-foreground">
            {total ? `${total.toLocaleString()} domains` : '—'}
          </p>
        </div>
        <Link href="/sites" className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}>
          View all
        </Link>
      </CardHeader>
      <CardContent>
        {loading && sites.length === 0 ? (
          <div className="grid">
            {SKELETON_KEYS.map(key => (
              <div key={key} className="flex items-center gap-6 border-b py-3 last:border-b-0">
                <Skeleton className="h-4 w-6" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-5 w-12" />
              </div>
            ))}
          </div>
        ) : error ? (
          <Alert>
            <AlertDescription>{error}</AlertDescription>
            <AlertAction>
              <Button variant="secondary" size="xs" onClick={() => fetchSites.run()}>
                Retry
              </Button>
            </AlertAction>
          </Alert>
        ) : sites.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No sites yet</EmptyTitle>
              <EmptyDescription>Domains appear here once someone looks them up.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[70px] text-center">#</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead className="text-right">DR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sites.map((site, index) => {
                const dr =
                  typeof site.domain_rating === 'number' && Number.isFinite(site.domain_rating)
                    ? site.domain_rating
                    : null
                const updated = formatUpdatedAt(site.updated_at)

                return (
                  <TableRow key={site.domain}>
                    <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                    <TableCell>
                      <Link
                        href={`/sites/${encodeURIComponent(site.domain)}`}
                        className="text-foreground hover:underline"
                      >
                        {site.domain}
                      </Link>
                      {updated ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Last checked {updated}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{dr === null ? 'DR —' : `DR ${dr}`}</Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
