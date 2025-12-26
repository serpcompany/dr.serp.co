import Link from "next/link"

import { listSites, countSites } from "@/server/db.mjs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"

import { SitesSearch } from "./sites-search"

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
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Top Sites</h1>
        </div>

        <div className="rounded-lg border bg-background">
          <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <span className="font-semibold">
                {totalCount.toLocaleString()} domain{totalCount === 1 ? "" : "s"}
              </span>
              {query ? (
                <span className="text-muted-foreground">
                  {" "}
                  · showing {showingFrom.toLocaleString()}–{showingTo.toLocaleString()}
                </span>
              ) : null}
            </div>
            <SitesSearch initialQuery={query} />
          </div>

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
                  <Button variant="outline" asChild>
                    <Link href="/sites">Clear search</Link>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[70px] text-center">#</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead className="text-right">DR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rows as ClaimRow[]).map((row, index) => {
                    const domain = String(row.domain)
                    const domainRating = row.domain_rating
                    const rank = offset + index + 1

                    return (
                      <TableRow key={domain}>
                        <TableCell className="text-center text-muted-foreground">{rank}</TableCell>
                        <TableCell>
                          <Link href={`/sites/${encodeURIComponent(domain)}`} className="text-foreground hover:underline">
                            {domain}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-medium">{Number.isFinite(domainRating) ? domainRating : "—"}</span>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between border-t p-4">
                <span className="text-sm text-muted-foreground">
                  Page {safePage.toLocaleString()} of {totalPages.toLocaleString()}
                </span>
                <div className="flex items-center gap-2">
                  {safePage <= 1 ? (
                    <Button variant="outline" size="sm" disabled>
                      Previous
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={makeHref(safePage - 1)}>Previous</Link>
                    </Button>
                  )}

                  {safePage >= totalPages ? (
                    <Button variant="outline" size="sm" disabled>
                      Next
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={makeHref(safePage + 1)}>Next</Link>
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
