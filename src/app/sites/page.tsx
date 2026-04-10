import Link from "next/link"

import { listSites, countSites } from "@/server/db.mjs"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

import { SitesSearch } from "./sites-search"
import { SitesDataTable } from "./sites-data-table"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ClaimRow = {
  domain: string
  domain_rating: number | null
  updated_at: string | null
}

function asInt(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export default async function SitesPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; page?: string }>
}) {
  const params = (await searchParams) ?? {}
  const query = String(params.q ?? "").trim()

  const limit = 50
  const requestedPage = Math.max(1, asInt(params.page, 1))
  const totalCount = await countSites({ query })
  const totalPages = Math.max(1, Math.ceil(totalCount / limit))
  const safePage = Math.min(requestedPage, totalPages)
  const offset = (safePage - 1) * limit
  const rows = await listSites({ query, limit, offset, sort: "dr" })

  const showingFrom = totalCount === 0 ? 0 : (safePage - 1) * limit + 1
  const showingTo = Math.min(totalCount, (safePage - 1) * limit + rows.length)

  const makeHref = (nextPage: number) => {
    const url = new URL("https://local.invalid/sites")
    if (query) url.searchParams.set("q", query)
    if (nextPage > 1) url.searchParams.set("page", String(nextPage))
    return `${url.pathname}${url.search}`
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-8 px-4 py-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Top Sites</h1>
        <p className="text-muted-foreground">Browse sites and their current Domain Rating.</p>
      </div>

      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-sm text-muted-foreground tabular-nums">
            <span className="font-medium text-foreground">
              {totalCount.toLocaleString()} domain{totalCount === 1 ? "" : "s"}
            </span>
            {query ? (
              <span>
                {" "}
                · showing {showingFrom.toLocaleString()}–{showingTo.toLocaleString()}
              </span>
            ) : null}
          </p>
          <SitesSearch initialQuery={query} />
        </div>

        <Card>
          {rows.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm text-muted-foreground">
                {query ? "No domains match your search." : "No domains yet."}
              </p>
              <div className="mt-4 flex items-center justify-center gap-3">
                <Button asChild>
                  <Link href="/">Look up a domain</Link>
                </Button>
                {query ? (
                  <Button asChild>
                    <Link href="/sites">Clear search</Link>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              <SitesDataTable rows={rows as ClaimRow[]} offset={offset} />

              <div className="flex items-center justify-between border-t p-4">
                <span className="text-sm text-muted-foreground">
                  Page {safePage.toLocaleString()} of {totalPages.toLocaleString()}
                </span>
                <div className="flex items-center gap-2">
                  {safePage <= 1 ? (
                    <Button disabled>
                      Previous
                    </Button>
                  ) : (
                    <Button asChild>
                      <Link href={makeHref(safePage - 1)}>Previous</Link>
                    </Button>
                  )}

                  {safePage >= totalPages ? (
                    <Button disabled>
                      Next
                    </Button>
                  ) : (
                    <Button asChild>
                      <Link href={makeHref(safePage + 1)}>Next</Link>
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </main>
  )
}
