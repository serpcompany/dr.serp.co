"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

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
        const response = await fetch("/api/sites?limit=12", { signal: controller.signal })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(typeof payload?.error === "string" ? payload.error : "Failed to load sites.")
        }
        setTotal(Number(payload?.total) || 0)
        setSites(Array.isArray(payload?.sites) ? payload.sites : [])
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
        setError(err instanceof Error ? err.message : "Failed to load sites.")
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
          <p className="text-xs text-muted-foreground">{total ? `${total.toLocaleString()} domains` : "—"}</p>
        </div>
        <Button asChild>
          <Link href="/sites">View all</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {loading && sites.length === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : error ? (
          <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted p-4">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={() => fetchSites.run()}>
              Retry
            </Button>
          </div>
        ) : sites.length === 0 ? (
          <div className="rounded-lg border bg-muted p-6 text-center">
            <p className="text-sm text-muted-foreground">No sites yet.</p>
          </div>
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
                  typeof site.domain_rating === "number" && Number.isFinite(site.domain_rating) ? site.domain_rating : null
                const updated = formatUpdatedAt(site.updated_at)

                return (
                  <TableRow key={site.domain}>
                    <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                    <TableCell>
                      <Link href={`/sites/${encodeURIComponent(site.domain)}`} className="text-foreground hover:underline">
                        {site.domain}
                      </Link>
                      {updated ? <div className="mt-1 text-xs text-muted-foreground">Last checked {updated}</div> : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge>{dr === null ? "DR —" : `DR ${dr}`}</Badge>
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
