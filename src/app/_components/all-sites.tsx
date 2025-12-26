"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type SiteRow = {
  domain: string
  domain_rating: number | null
  updated_at: string | null
}

function formatUpdatedAt(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date)
}

export function AllSites() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sites, setSites] = useState<SiteRow[]>([])

  const fetchSites = useMemo(() => {
    let controller: AbortController | null = null
    const run = async () => {
      if (controller) controller.abort()
      controller = new AbortController()

      setLoading(true)
      setError(null)
      try {
        const response = await fetch("/api/sites?limit=12", { signal: controller.signal })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(typeof payload?.error === "string" ? payload.error : "Failed to load sites.")
        }
        setSites(Array.isArray(payload?.sites) ? payload.sites : [])
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
        setError(err instanceof Error ? err.message : "Failed to load sites.")
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
        <CardTitle>All sites</CardTitle>
        <Button asChild variant="secondary" size="sm">
          <Link href="/sites">View all</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {loading && sites.length === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="h-20 animate-pulse rounded-lg border bg-muted/20" />
            ))}
          </div>
        ) : error ? (
          <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/20 p-4">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="secondary" size="sm" onClick={() => fetchSites.run()}>
              Retry
            </Button>
          </div>
        ) : sites.length === 0 ? (
          <div className="rounded-lg border bg-muted/20 p-6 text-center">
            <p className="text-sm text-muted-foreground">No sites yet.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sites.map((site) => {
              const dr =
                typeof site.domain_rating === "number" && Number.isFinite(site.domain_rating) ? site.domain_rating : null
              const updated = formatUpdatedAt(site.updated_at)

              return (
                <Link
                  key={site.domain}
                  href={`/sites/${encodeURIComponent(site.domain)}`}
                  className="group rounded-lg border bg-background p-4 transition hover:bg-muted/20"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium group-hover:underline">{site.domain}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{updated ? `Last checked ${updated}` : "—"}</p>
                    </div>
                    <Badge variant="secondary">{dr === null ? "DR —" : `DR ${dr}`}</Badge>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

