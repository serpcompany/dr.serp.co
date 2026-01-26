"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BillingPortalButton } from "@/app/_components/billing-portal-button"

import { filterSiteHistory, removeSiteHistory, type SiteRow } from "@/lib/site-history"

function formatUpdatedAt(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date)
}

export function MySites({ email }: { email: string }) {
  const [query, setQuery] = useState("")
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
        const response = await fetch("/api/my-sites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmedEmail, query: nextQuery, limit: 12, offset: 0 }),
          signal: controller.signal,
        })
        const payload = await response.json().catch(() => ({}))
        if (response.status === 402 && payload?.code === "upgrade_required") {
          setUpgrade({
            message: typeof payload?.error === "string" ? payload.error : "Upgrade required to manage domains.",
            entitlement: payload?.entitlement ?? null,
          })
          setSites(localMatches)
          return
        }
        if (!response.ok) {
          throw new Error(typeof payload?.error === "string" ? payload.error : "Failed to load sites.")
        }
        const remoteSites: SiteRow[] = Array.isArray(payload?.sites) ? payload.sites : []
        const merged = new Map<string, SiteRow>()
        for (const row of localMatches) merged.set(row.domain, row)
        for (const row of remoteSites) merged.set(row.domain, row)
        setSites(Array.from(merged.values()))
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
        setError(err instanceof Error ? err.message : "Failed to load sites.")
        setSites(localMatches)
      } finally {
        setLoading(false)
      }
    }

    return { run, abort: () => controller?.abort() }
  }, [trimmedEmail])

  useEffect(() => {
    fetchSites.run("")
    return () => fetchSites.abort()
  }, [fetchSites])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      fetchSites.run(query.trim())
    }, 250)

    return () => window.clearTimeout(handle)
  }, [fetchSites, query])

  const remove = async (domain: string) => {
    const normalizedDomain = String(domain ?? "").trim().toLowerCase()
    if (!normalizedDomain) return

    setRemoving(normalizedDomain)
    setSites((prev) => prev.filter((row) => row.domain !== normalizedDomain))
    removeSiteHistory(trimmedEmail, normalizedDomain)

    try {
      const response = await fetch("/api/claims", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, domain: normalizedDomain }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(typeof payload?.error === "string" ? payload.error : "Failed to delete site.")
      }
      toast.success("Removed from your sites")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete site.")
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
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your sites…" />
        </div>
      </CardHeader>
      <CardContent>
        {upgrade ? (
          <div className="rounded-lg border bg-muted/20 p-6 text-center">
            <p className="text-sm text-muted-foreground">{upgrade.message}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button asChild size="sm">
                <Link href="/pricing">View plans</Link>
              </Button>
              {upgrade.entitlement?.subscription?.stripeCustomerId ? (
                <BillingPortalButton email={trimmedEmail} />
              ) : null}
            </div>
          </div>
        ) : loading && sites.length === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="h-20 animate-pulse rounded-lg border bg-muted/20" />
            ))}
          </div>
        ) : error && sites.length === 0 ? (
          <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/20 p-4">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="secondary" size="sm" onClick={() => fetchSites.run(query.trim())}>
              Retry
            </Button>
          </div>
        ) : sites.length === 0 ? (
          <div className="rounded-lg border bg-muted/20 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {query.trim() ? "No matching sites yet." : "No sites yet — look up a domain to start."}
            </p>
            {!query.trim() ? (
              <div className="mt-4 flex justify-center">
                <Button asChild size="sm">
                  <Link href="/">Look up a domain</Link>
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            {error ? <p className="text-xs text-muted-foreground">Some sites may be missing: {error}</p> : null}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sites.map((site) => {
              const dr =
                typeof site.domain_rating === "number" && Number.isFinite(site.domain_rating) ? site.domain_rating : null
              const updated = formatUpdatedAt(site.updated_at)

              return (
                <div key={site.domain} className="relative">
                  <Link
                    href={`/sites/${encodeURIComponent(site.domain)}`}
                    className="group block rounded-lg border bg-background p-4 transition hover:bg-muted/20"
                  >
	                    <div className="flex items-start justify-between gap-3">
	                      <div className="min-w-0">
	                        <p className="truncate text-sm font-medium group-hover:underline">{site.domain}</p>
	                        <p className="mt-1 text-xs text-muted-foreground">
	                          {updated ? `Last checked ${updated}` : "No recent check"}
	                        </p>
	                      </div>
	                      <Badge variant="secondary">{dr === null ? "DR —" : `DR ${dr}`}</Badge>
	                    </div>
	                  </Link>
	                  <Button
	                    type="button"
	                    variant="ghost"
	                    size="icon"
                    className="absolute right-2 top-2 h-8 w-8 text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${site.domain}`}
                    disabled={removing === site.domain}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      remove(site.domain)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )
            })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
