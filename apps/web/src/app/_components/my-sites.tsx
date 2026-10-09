'use client'

import { Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { BillingPortalButton } from '@/app/_components/billing-portal-button'
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle
} from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle
} from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import { readJsonRecord } from '@/lib/read-json'
import { filterSiteHistory, removeSiteHistory, type SiteRow } from '@/lib/site-history'
import { cn } from '@/lib/utils'

const SKELETON_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6']

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

export function MySites({ email }: { email: string }) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [upgrade, setUpgrade] = useState<{ message: string; entitlement?: any } | null>(null)
  const [sites, setSites] = useState<SiteRow[]>([])

  const trimmedEmail = email.trim().toLowerCase()
  const [removing, setRemoving] = useState<string | null>(null)

  const fetchSites = useMemo(() => {
    let controller: AbortController | null = null
    const run = async (nextQuery: string) => {
      if (controller) controller.abort()
      controller = new AbortController()

      setLoading(true)
      setError(null)
      setUpgrade(null)
      const localMatches = filterSiteHistory(trimmedEmail, nextQuery).slice(0, 12)
      setSites(localMatches)

      try {
        const response = await fetch('/api/my-sites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: trimmedEmail, query: nextQuery, limit: 12, offset: 0 }),
          signal: controller.signal
        })
        const payload = await readJsonRecord(response)
        if (payload?.code === 'upgrade_required') {
          setUpgrade({
            message:
              typeof payload?.error === 'string'
                ? payload.error
                : 'Upgrade required to manage domains.',
            entitlement: payload?.entitlement ?? null
          })
          setSites(localMatches)
          return
        }
        if (!response.ok) {
          throw new Error(
            typeof payload?.error === 'string' ? payload.error : 'Failed to load sites.'
          )
        }
        const remoteSites: SiteRow[] = Array.isArray(payload?.sites) ? payload.sites : []
        const merged = new Map<string, SiteRow>()
        for (const row of localMatches) merged.set(row.domain, row)
        for (const row of remoteSites) merged.set(row.domain, row)
        setSites(Array.from(merged.values()))
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Failed to load sites.')
        setSites(localMatches)
      } finally {
        setLoading(false)
      }
    }

    return { run, abort: () => controller?.abort() }
  }, [trimmedEmail])

  useEffect(() => {
    fetchSites.run('')
    return () => fetchSites.abort()
  }, [fetchSites])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      fetchSites.run(query.trim())
    }, 250)

    return () => window.clearTimeout(handle)
  }, [fetchSites, query])

  const remove = async (domain: string) => {
    const normalizedDomain = String(domain ?? '')
      .trim()
      .toLowerCase()
    if (!normalizedDomain) return

    setRemoving(normalizedDomain)
    setSites(prev => prev.filter(row => row.domain !== normalizedDomain))
    removeSiteHistory(trimmedEmail, normalizedDomain)

    try {
      const response = await fetch('/api/claims', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, domain: normalizedDomain })
      })
      if (!response.ok) {
        const payload = await readJsonRecord(response)
        throw new Error(
          typeof payload?.error === 'string' ? payload.error : 'Failed to delete site.'
        )
      }
      toast.success('Removed from your sites')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete site.')
      fetchSites.run(query.trim())
    } finally {
      setRemoving(null)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Your sites</CardTitle>
        <div className="w-full sm:w-[260px]">
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search your sites…"
          />
        </div>
      </CardHeader>
      <CardContent>
        {upgrade ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{upgrade.message}</EmptyTitle>
            </EmptyHeader>
            <EmptyContent className="flex-row flex-wrap justify-center">
              <Link href="/pricing" className={cn(buttonVariants({ size: 'sm' }))}>
                View plans
              </Link>
              {upgrade.entitlement?.subscription?.stripeCustomerId ? (
                <BillingPortalButton email={trimmedEmail} />
              ) : null}
            </EmptyContent>
          </Empty>
        ) : loading && sites.length === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {SKELETON_KEYS.map(key => (
              <Skeleton key={key} className="h-[62px]" />
            ))}
          </div>
        ) : error && sites.length === 0 ? (
          <Alert>
            <AlertDescription>{error}</AlertDescription>
            <AlertAction>
              <Button variant="secondary" size="xs" onClick={() => fetchSites.run(query.trim())}>
                Retry
              </Button>
            </AlertAction>
          </Alert>
        ) : sites.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{query.trim() ? 'No matching sites' : 'No sites yet'}</EmptyTitle>
              <EmptyDescription>
                {query.trim()
                  ? 'None of your sites match this search.'
                  : 'Look up a domain to start.'}
              </EmptyDescription>
            </EmptyHeader>
            {!query.trim() ? (
              <EmptyContent>
                <Link href="/add" className={cn(buttonVariants({ size: 'sm' }))}>
                  Look up a domain
                </Link>
              </EmptyContent>
            ) : null}
          </Empty>
        ) : (
          <div className="space-y-3">
            {error ? (
              <p className="text-xs text-muted-foreground">Some sites may be missing: {error}</p>
            ) : null}
            <ItemGroup className="grid gap-3 sm:grid-cols-2">
              {sites.map(site => {
                const dr =
                  typeof site.domain_rating === 'number' && Number.isFinite(site.domain_rating)
                    ? site.domain_rating
                    : null
                const updated = formatUpdatedAt(site.updated_at)

                return (
                  <Item
                    key={site.domain}
                    role="listitem"
                    variant="outline"
                    // ItemTitle clips its content, so the item shows the link's keyboard focus.
                    className="relative has-[a:focus-visible]:border-ring has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50"
                  >
                    <ItemContent className="min-w-0">
                      <ItemTitle className="w-full">
                        {/* The link covers the whole item; only the remove button sits above it. */}
                        <Link
                          href={`/sites/${encodeURIComponent(site.domain)}`}
                          className="truncate outline-none after:absolute after:inset-0 hover:underline"
                        >
                          {site.domain}
                        </Link>
                      </ItemTitle>
                      <ItemDescription>
                        {updated ? `Last checked ${updated}` : 'No recent check'}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Badge variant="secondary">{dr === null ? 'DR —' : `DR ${dr}`}</Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${site.domain}`}
                        className="relative"
                        disabled={removing === site.domain}
                        onClick={() => remove(site.domain)}
                      >
                        <Trash2 />
                      </Button>
                    </ItemActions>
                  </Item>
                )
              })}
            </ItemGroup>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
