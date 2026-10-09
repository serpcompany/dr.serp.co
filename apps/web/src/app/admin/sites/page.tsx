'use client'

import { ExternalLinkIcon, MoreHorizontalIcon, PencilIcon, SearchIcon, Trash2Icon } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { SITES } from '../_mock/data'
import { LoadError, NoResults, TableSkeleton, useMockState } from '../_mock/states'

export default function AdminSitesPage() {
  const state = useMockState()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sites</CardTitle>
        <CardDescription>468 listed domains · 31 claimed</CardDescription>
        <CardAction className="max-sm:col-span-2 max-sm:col-start-1 max-sm:row-start-3 max-sm:justify-self-stretch">
          <InputGroup className="w-full sm:w-72">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search domains or owner emails"
              aria-label="Search sites"
              defaultValue={state === 'empty' ? 'zzzz' : undefined}
            />
          </InputGroup>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="claimed">Claimed</TabsTrigger>
            <TabsTrigger value="unclaimed">Unclaimed</TabsTrigger>
          </TabsList>
        </Tabs>
        {state === 'loading' ? (
          <TableSkeleton />
        ) : state === 'error' ? (
          <LoadError what="Sites" />
        ) : state === 'empty' ? (
          <NoResults
            title="No matching sites"
            description="No domain or owner email matches “zzzz”."
            action={
              <Link href="/admin/sites" className={cn(buttonVariants({ variant: 'outline' }))}>
                Clear search
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead className="text-right">DR</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>Last checked</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SITES.map(site => (
                  <TableRow key={site.domain}>
                    <TableCell className="font-medium">
                      <Link href={`/admin/sites/${site.domain}`} className="hover:underline">
                        {site.domain}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{site.dr ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{site.owner ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={site.link === 'follow' ? 'default' : 'outline'}>
                        {site.link === 'follow' ? 'Dofollow' : 'Nofollow'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{site.lastChecked}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${site.domain}`} />}
                        >
                          <MoreHorizontalIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem render={<Link href={`/admin/sites/${site.domain}`} />}>
                            <PencilIcon />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem render={<Link href={`/sites/${site.domain}`} />}>
                            <ExternalLinkIcon />
                            View public page
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" render={<Link href={`/admin/sites/${site.domain}?dialog=delete`} />}>
                            <Trash2Icon />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      {state === 'ready' ? (
        <CardFooter className="justify-between gap-4 max-sm:flex-col">
          <span className="text-sm text-muted-foreground">Showing 1–50 of 468</span>
          <Pagination className="mx-0 w-auto">
            <PaginationContent>
              {[1, 2, 3].map(page => (
                <PaginationItem key={page}>
                  <Link
                    href="/admin/sites"
                    aria-current={page === 1 ? 'page' : undefined}
                    className={cn(buttonVariants({ variant: page === 1 ? 'outline' : 'ghost', size: 'icon' }))}
                  >
                    {page}
                  </Link>
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
              <PaginationItem>
                <Link href="/admin/sites" className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}>
                  10
                </Link>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </CardFooter>
      ) : null}
    </Card>
  )
}
