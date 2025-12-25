import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { countClaims, listClaims } from "@/server/db.mjs"

export const runtime = "nodejs"

function buildHref({ q, page }: { q: string; page: number }) {
  const params = new URLSearchParams()
  if (q) params.set("q", q)
  if (page > 1) params.set("page", String(page))
  const qs = params.toString()
  return qs ? `/sites?${qs}` : "/sites"
}

function getPageNumbers(currentPage: number, totalPages: number) {
  const pages: (number | "…")[] = []
  const windowSize = 2

  const start = Math.max(1, currentPage - windowSize)
  const end = Math.min(totalPages, currentPage + windowSize)

  if (start > 1) {
    pages.push(1)
    if (start > 2) pages.push("…")
  }

  for (let p = start; p <= end; p++) pages.push(p)

  if (end < totalPages) {
    if (end < totalPages - 1) pages.push("…")
    pages.push(totalPages)
  }

  return pages
}

export default async function SitesIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const q = String(sp.q ?? "").trim()
  const pageParam = Number(Array.isArray(sp.page) ? sp.page[0] : sp.page)
  const currentPage = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1
  const pageSize = 25
  const offset = (currentPage - 1) * pageSize

  const [total, rows] = await Promise.all([
    countClaims({ query: q }),
    listClaims({ query: q, limit: pageSize, offset }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const prevHref = safePage > 1 ? buildHref({ q, page: safePage - 1 }) : null
  const nextHref = safePage < totalPages ? buildHref({ q, page: safePage + 1 }) : null

  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-[1200px] space-y-6">
        <header className="space-y-3 text-center">
          <div className="flex justify-center">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href="/">Home</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Sites</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <h1 className="scroll-m-20 text-3xl font-semibold tracking-tight">Sites</h1>
          <p className="text-muted-foreground text-sm">Look up a domain’s DR page.</p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>All sites</CardTitle>
          </CardHeader>
          <CardContent>
            <form method="GET" action="/sites" className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input name="q" defaultValue={q} placeholder="Search domains…" autoComplete="off" />
              <Button type="submit" className="sm:w-auto">
                Search
              </Button>
            </form>

            <div className="mt-4 space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead className="text-right">DR</TableHead>
                    <TableHead className="text-right">Last checked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground py-10 text-center">
                        No sites found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row: any) => (
                      <TableRow key={row.domain}>
                        <TableCell className="font-medium">
                          <Link href={`/sites/${encodeURIComponent(row.domain)}`} className="hover:underline">
                            {row.domain}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.domain_rating === null || row.domain_rating === undefined ? "—" : Number(row.domain_rating)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {row.updated_at ? new Date(row.updated_at).toLocaleDateString("en-US") : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href={prevHref || "#"}
                      className={prevHref ? undefined : "pointer-events-none opacity-50"}
                    />
                  </PaginationItem>

                  {getPageNumbers(safePage, totalPages).map((p, idx) =>
                    p === "…" ? (
                      <PaginationItem key={`ellipsis-${idx}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={p}>
                        <PaginationLink href={buildHref({ q, page: p })} isActive={p === safePage}>
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  )}

                  <PaginationItem>
                    <PaginationNext
                      href={nextHref || "#"}
                      className={nextHref ? undefined : "pointer-events-none opacity-50"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
