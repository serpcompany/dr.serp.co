import { ChevronLeftIcon, ChevronRightIcon, SearchXIcon } from 'lucide-react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem
} from '@/components/ui/pagination'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { countSites, listSites } from '@/db'
import { pageItems } from '@/lib/pagination'
import { cn } from '@/lib/utils'
import { SitesSearch } from './sites-search'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SiteRow = {
  domain: string
  domain_rating: number | null
  updated_at: string | null
}

function asInt(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export default async function SitesPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string; page?: string }>
}) {
  const params = (await searchParams) ?? {}
  const query = String(params.q ?? '').trim()

  const limit = 50
  const requestedPage = Math.max(1, asInt(params.page, 1))
  const totalCount = await countSites({ query })
  const totalPages = Math.max(1, Math.ceil(totalCount / limit))
  const safePage = Math.min(requestedPage, totalPages)
  const offset = (safePage - 1) * limit
  const rows = await listSites({ query, limit, offset, sort: 'dr' })

  const showingFrom = totalCount === 0 ? 0 : (safePage - 1) * limit + 1
  const showingTo = Math.min(totalCount, (safePage - 1) * limit + rows.length)

  const pages = pageItems(safePage, totalPages)
  const currentIndex = pages.indexOf(safePage)

  const makeHref = (nextPage: number) => {
    const url = new URL('https://local.invalid/sites')
    if (query) url.searchParams.set('q', query)
    if (nextPage > 1) url.searchParams.set('page', String(nextPage))
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
              {totalCount.toLocaleString()} domain{totalCount === 1 ? '' : 's'}
            </span>
            {query ? (
              <span>
                {' '}
                · showing {showingFrom.toLocaleString()}–{showingTo.toLocaleString()}
              </span>
            ) : null}
          </p>
          <SitesSearch initialQuery={query} />
        </div>

        {rows.length === 0 ? (
          <Card>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchXIcon />
                </EmptyMedia>
                <EmptyTitle>{query ? 'No matching domains' : 'No domains yet'}</EmptyTitle>
                <EmptyDescription>
                  {query
                    ? `No listed domain matches “${query}”.`
                    : 'Domains appear here once someone looks them up.'}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="flex-row justify-center">
                <Link href="/account/sites?add=1" className={cn(buttonVariants())}>
                  Look up a domain
                </Link>
                {query ? (
                  <Link href="/sites" className={cn(buttonVariants({ variant: 'outline' }))}>
                    Clear search
                  </Link>
                ) : null}
              </EmptyContent>
            </Empty>
          </Card>
        ) : (
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[70px] text-center">#</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead className="text-right">DR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rows as SiteRow[]).map((row, index) => (
                  // WebKit ignores position: relative on a <tr>; a transform makes the row the
                  // stretched link's containing block in every engine.
                  <TableRow
                    key={row.domain}
                    className="relative [transform:translate(0)] has-[a:focus-visible]:bg-muted"
                  >
                    <TableCell className="text-center tabular-nums text-muted-foreground">
                      {offset + index + 1}
                    </TableCell>
                    <TableCell className="max-w-[420px] truncate">
                      {/* The link covers the whole row, so any part of it opens the site. */}
                      <Link
                        href={`/sites/${encodeURIComponent(row.domain)}`}
                        className="text-foreground after:absolute after:inset-0 hover:underline"
                      >
                        {row.domain}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {typeof row.domain_rating === 'number' && Number.isFinite(row.domain_rating)
                        ? row.domain_rating
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {totalPages > 1 ? (
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                {safePage > 1 ? (
                  <Link
                    href={makeHref(safePage - 1)}
                    aria-label="Go to previous page"
                    className={cn(buttonVariants({ variant: 'ghost' }))}
                  >
                    <ChevronLeftIcon data-icon="inline-start" />
                    <span className="hidden sm:block">Previous</span>
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className={cn(buttonVariants({ variant: 'ghost' }), 'opacity-50')}
                  >
                    <ChevronLeftIcon data-icon="inline-start" />
                    <span className="hidden sm:block">Previous</span>
                  </span>
                )}
              </PaginationItem>
              {pages.map((item, index) =>
                item === 'ellipsis' ? (
                  <PaginationItem key={index < currentIndex ? 'ellipsis-before' : 'ellipsis-after'}>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={item}>
                    <Link
                      href={makeHref(item)}
                      aria-current={item === safePage ? 'page' : undefined}
                      className={cn(
                        buttonVariants({
                          variant: item === safePage ? 'outline' : 'ghost',
                          size: 'icon'
                        })
                      )}
                    >
                      {item}
                    </Link>
                  </PaginationItem>
                )
              )}
              <PaginationItem>
                {safePage < totalPages ? (
                  <Link
                    href={makeHref(safePage + 1)}
                    aria-label="Go to next page"
                    className={cn(buttonVariants({ variant: 'ghost' }))}
                  >
                    <span className="hidden sm:block">Next</span>
                    <ChevronRightIcon data-icon="inline-end" />
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className={cn(buttonVariants({ variant: 'ghost' }), 'opacity-50')}
                  >
                    <span className="hidden sm:block">Next</span>
                    <ChevronRightIcon data-icon="inline-end" />
                  </span>
                )}
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        ) : null}
      </div>
    </main>
  )
}
