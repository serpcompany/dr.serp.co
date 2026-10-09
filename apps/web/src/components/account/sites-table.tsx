'use client'

import {
  type ColumnFiltersState,
  type ColumnVisibilityState,
  columnFilteringFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  FlexRender,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  type SortingState,
  tableFeatures,
  useTable
} from '@tanstack/react-table'
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  CircleCheckIcon,
  CircleIcon,
  Columns3Icon,
  CopyIcon,
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  MinusIcon,
  PlusIcon,
  RefreshCwIcon,
  TrendingDownIcon,
  TrendingUpIcon
} from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'
import { BadgeEmbed, getBadgeEmbedCode } from '@/components/badges/badge-embed'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle
} from '@/components/ui/drawer'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIsMobile } from '@/hooks/use-mobile'
import type { AccountSite } from '@/lib/account'
import { cn } from '@/lib/utils'
import { recheck, release } from './actions'

// dashboard-01's DataTable for the claimed sites (#140 mockups, Sites). Differences from the
// block: no drag handles (sites sort by DR, not by hand), the tabs filter by DR change, and the
// row viewer is the site panel (DR history, recheck, badge, link, release), one drawer for the
// table that `?site=<domain>` opens, from any page of the table or any view.

/** Where the badge and its link point: the site's own origin and the badge host. */
export type BadgeUrls = { site: string; badge: string }

type TableContext = {
  urls: BadgeUrls
  dofollow: boolean
  onOpen: (domain: string | null) => void
  onRelease: (domain: string) => void
}

const Context = React.createContext<TableContext | null>(null)

function useTableContext(): TableContext {
  const context = React.useContext(Context)
  if (!context) throw new Error('SitesTable context missing')
  return context
}

function badgeFor(site: AccountSite, urls: BadgeUrls) {
  return {
    domain: site.domain,
    dr: site.dr,
    linkUrl: `${urls.site}/sites/${encodeURIComponent(site.domain)}`,
    badgeUrl: `${urls.badge}/badge/${encodeURIComponent(site.domain)}?style=serp-dr-v3`
  }
}

async function copyBadgeCode(site: AccountSite, urls: BadgeUrls) {
  try {
    await navigator.clipboard.writeText(getBadgeEmbedCode(badgeFor(site, urls)))
    toast.success('Badge embed code copied to clipboard!')
  } catch {
    toast.error('Failed to copy embed code')
  }
}

async function onRecheck(domain: string, refresh: () => void) {
  const result = await recheck(domain)
  if (result.ok) {
    toast.success(`Rechecked ${domain}.`)
    refresh()
  } else {
    toast.error(result.message)
  }
}

const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

const features = tableFeatures({
  columnFilteringFeature,
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel()
})

const columnHelper = createColumnHelper<typeof features, AccountSite>()

export function ChangeBadge({ change }: { change: number | null }) {
  return (
    <Badge variant="outline" className="px-1.5 text-muted-foreground">
      {change === null || change === 0 ? (
        <MinusIcon />
      ) : change > 0 ? (
        <TrendingUpIcon className="text-primary" />
      ) : (
        <TrendingDownIcon className="text-destructive" />
      )}
      {change === null ? 'New' : change > 0 ? `+${change}` : change < 0 ? change : 'Steady'}
    </Badge>
  )
}

function LinkBadge() {
  const { dofollow } = useTableContext()
  return (
    <Badge variant="outline" className="px-1.5 text-muted-foreground">
      {dofollow ? <CircleCheckIcon className="text-primary" /> : <CircleIcon />}
      {dofollow ? 'Dofollow' : 'Nofollow'}
    </Badge>
  )
}

function RowActions({ site }: { site: AccountSite }) {
  const router = useRouter()
  const { urls, onRelease } = useTableContext()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="flex size-8 text-muted-foreground data-open:bg-muted"
            size="icon"
          />
        }
      >
        <EllipsisVerticalIcon />
        <span className="sr-only">Actions for {site.domain}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => void onRecheck(site.domain, () => router.refresh())}>
          <RefreshCwIcon />
          Recheck DR
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void copyBadgeCode(site, urls)}>
          <CopyIcon />
          Copy badge code
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={`/sites/${encodeURIComponent(site.domain)}`} />}>
          <ExternalLinkIcon />
          Public page
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => onRelease(site.domain)}>
          Release
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const columns = columnHelper.columns([
  columnHelper.display({
    id: 'select',
    header: ({ table }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
          onCheckedChange={value => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={value => row.toggleSelected(!!value)}
          aria-label={`Select ${row.original.domain}`}
        />
      </div>
    ),
    enableSorting: false,
    enableHiding: false
  }),
  columnHelper.accessor('domain', {
    header: 'Site',
    cell: ({ row }) => <SiteLink domain={row.original.domain} />,
    enableHiding: false
  }),
  columnHelper.accessor('dr', {
    header: () => <div className="w-full text-right">DR</div>,
    cell: ({ row }) => (
      <div className="text-right font-mono text-base font-semibold tabular-nums">
        {row.original.dr ?? '—'}
      </div>
    )
  }),
  columnHelper.accessor('change', {
    header: 'This month',
    cell: ({ row }) => <ChangeBadge change={row.original.change} />
  }),
  columnHelper.accessor('checkedAt', {
    header: 'Last check',
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.checkedAt ? DAY.format(new Date(row.original.checkedAt)) : '—'}
      </span>
    )
  }),
  columnHelper.display({
    id: 'link',
    header: 'Link',
    cell: () => <LinkBadge />
  }),
  columnHelper.display({
    id: 'actions',
    cell: ({ row }) => <RowActions site={row.original} />
  })
])

const VIEWS = [
  { value: 'all', label: 'All sites', filter: () => true },
  { value: 'rising', label: 'Rising', filter: (site: AccountSite) => (site.change ?? 0) > 0 },
  { value: 'falling', label: 'Falling', filter: (site: AccountSite) => (site.change ?? 0) < 0 }
]

const PAGE_SIZES = [10, 20, 30, 40, 50]

const COLUMN_LABELS: Record<string, string> = {
  dr: 'DR',
  change: 'This month',
  checkedAt: 'Last check'
}

export function SitesTable({
  data,
  urls,
  dofollow,
  empty
}: {
  data: AccountSite[]
  urls: BadgeUrls
  /** Whether the account's plan makes its sites' links dofollow. */
  dofollow: boolean
  empty?: React.ReactNode
}) {
  const router = useRouter()
  // The open panel is the URL's `?site=`: a sidebar link, the add dialog or a row sets it.
  const opened = useSearchParams()?.get('site') ?? null
  const panelSite = opened ? (data.find(site => site.domain === opened) ?? null) : null
  // The last site shown stays in the drawer while it animates closed.
  const [shownSite, setShownSite] = React.useState<AccountSite | null>(panelSite)
  React.useEffect(() => {
    if (panelSite) setShownSite(panelSite)
  }, [panelSite])
  const openPanel = React.useCallback((domain: string | null) => {
    const params = new URLSearchParams(window.location.search)
    if (domain) params.set('site', domain)
    else params.delete('site')
    const query = params.toString()
    // Next keeps useSearchParams in step with history.replaceState, without a server round trip.
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
  }, [])
  const isMobile = useIsMobile()
  const [view, setView] = React.useState('all')
  const [releasing, setReleasing] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [rowSelection, setRowSelection] = React.useState({})
  const [columnVisibility, setColumnVisibility] = React.useState<ColumnVisibilityState>({})
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 10 })
  // On phones the secondary columns start hidden; Columns brings them back.
  React.useEffect(() => {
    if (isMobile) setColumnVisibility({ checkedAt: false, link: false })
  }, [isMobile])
  const rows = React.useMemo(
    () => data.filter(VIEWS.find(item => item.value === view)?.filter ?? (() => true)),
    [data, view]
  )
  const table = useTable({
    features,
    data: rows,
    columns,
    state: { sorting, columnVisibility, rowSelection, columnFilters, pagination },
    getRowId: row => row.domain,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination
  })

  async function confirmRelease() {
    if (!releasing) return
    setBusy(true)
    const result = await release(releasing)
    setBusy(false)
    if (result.ok) {
      toast.success(`Released ${releasing}.`)
      if (opened === releasing) openPanel(null)
      setReleasing(null)
      router.refresh()
    } else {
      toast.error(result.message)
    }
  }

  const context = React.useMemo(
    () => ({ urls, dofollow, onOpen: openPanel, onRelease: setReleasing }),
    [urls, dofollow, openPanel]
  )

  return (
    <Context.Provider value={context}>
      <Tabs
        value={view}
        onValueChange={value => setView(String(value))}
        className="w-full flex-col justify-start gap-6"
      >
        <div className="flex items-center justify-between px-4 lg:px-6">
          <Label htmlFor="view-selector" className="sr-only">
            View
          </Label>
          <Select
            value={view}
            onValueChange={value => (value ? setView(String(value)) : null)}
            items={VIEWS.map(({ label, value }) => ({ label, value }))}
          >
            <SelectTrigger className="flex w-fit @4xl/main:hidden" size="sm" id="view-selector">
              <SelectValue placeholder="Select a view" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {VIEWS.map(item => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <TabsList className="hidden **:data-[slot=badge]:size-5 **:data-[slot=badge]:rounded-full **:data-[slot=badge]:bg-muted-foreground/30 **:data-[slot=badge]:px-1 @4xl/main:flex">
            {VIEWS.map(item => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label}
                {item.value === 'all' ? null : (
                  <Badge variant="secondary">{data.filter(item.filter).length}</Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
                <Columns3Icon data-icon="inline-start" />
                Columns
                <ChevronDownIcon data-icon="inline-end" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                {table
                  .getAllColumns()
                  .filter(column => column.id in COLUMN_LABELS || column.id === 'link')
                  .map(column => (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      checked={column.getIsVisible()}
                      onCheckedChange={value => column.toggleVisibility(!!value)}
                    >
                      {COLUMN_LABELS[column.id] ?? 'Link'}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Link
              href="/account/sites?add=1"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              <PlusIcon />
              <span className="hidden lg:inline">Add site</span>
              <span className="sr-only lg:hidden">Add site</span>
            </Link>
          </div>
        </div>
        <TabsContent
          value={view}
          className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6"
        >
          {data.length === 0 && empty ? (
            empty
          ) : (
            <>
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-muted">
                    {table.getHeaderGroups().map(headerGroup => (
                      <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map(header => (
                          <TableHead key={header.id} colSpan={header.colSpan}>
                            {header.isPlaceholder ? null : <FlexRender header={header} />}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody className="**:data-[slot=table-cell]:first:w-8">
                    {table.getRowModel().rows?.length ? (
                      table.getRowModel().rows.map(row => (
                        <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                          {row.getVisibleCells().map(cell => (
                            <TableCell key={cell.id}>
                              <FlexRender cell={cell} />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={columns.length} className="h-24 text-center">
                          No sites here.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between px-4">
                <div className="hidden flex-1 text-sm text-muted-foreground lg:flex">
                  {table.getFilteredSelectedRowModel().rows.length} of{' '}
                  {table.getFilteredRowModel().rows.length} site(s) selected.
                </div>
                <div className="flex w-full items-center gap-8 lg:w-fit">
                  <div className="hidden items-center gap-2 lg:flex">
                    <Label htmlFor="rows-per-page" className="text-sm font-medium">
                      Rows per page
                    </Label>
                    <Select
                      value={`${table.state.pagination.pageSize}`}
                      onValueChange={value => {
                        table.setPageSize(Number(value))
                      }}
                      items={PAGE_SIZES.map(pageSize => ({
                        label: `${pageSize}`,
                        value: `${pageSize}`
                      }))}
                    >
                      <SelectTrigger size="sm" className="w-20" id="rows-per-page">
                        <SelectValue placeholder={table.state.pagination.pageSize} />
                      </SelectTrigger>
                      <SelectContent side="top">
                        <SelectGroup>
                          {PAGE_SIZES.map(pageSize => (
                            <SelectItem key={pageSize} value={`${pageSize}`}>
                              {pageSize}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex w-fit items-center justify-center text-sm font-medium">
                    Page {table.state.pagination.pageIndex + 1} of{' '}
                    {Math.max(1, table.getPageCount())}
                  </div>
                  <div className="ml-auto flex items-center gap-2 lg:ml-0">
                    <Button
                      variant="outline"
                      className="hidden h-8 w-8 p-0 lg:flex"
                      onClick={() => table.setPageIndex(0)}
                      disabled={!table.getCanPreviousPage()}
                    >
                      <span className="sr-only">Go to first page</span>
                      <ChevronsLeftIcon />
                    </Button>
                    <Button
                      variant="outline"
                      className="size-8"
                      size="icon"
                      onClick={() => table.previousPage()}
                      disabled={!table.getCanPreviousPage()}
                    >
                      <span className="sr-only">Go to previous page</span>
                      <ChevronLeftIcon />
                    </Button>
                    <Button
                      variant="outline"
                      className="size-8"
                      size="icon"
                      onClick={() => table.nextPage()}
                      disabled={!table.getCanNextPage()}
                    >
                      <span className="sr-only">Go to next page</span>
                      <ChevronRightIcon />
                    </Button>
                    <Button
                      variant="outline"
                      className="hidden size-8 lg:flex"
                      size="icon"
                      onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                      disabled={!table.getCanNextPage()}
                    >
                      <span className="sr-only">Go to last page</span>
                      <ChevronsRightIcon />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
      {shownSite ? (
        <SitePanel
          site={panelSite ?? shownSite}
          open={panelSite !== null}
          onOpenChange={open => (open ? null : openPanel(null))}
        />
      ) : null}
      <AlertDialog
        open={releasing !== null}
        onOpenChange={open => (open ? null : setReleasing(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release {releasing}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its page stays public, but its link goes back to nofollow and it frees a slot on your
              plan. Anyone with a plan can claim it next, you included.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={event => {
                event.preventDefault()
                void confirmRelease()
              }}
            >
              Release
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Context.Provider>
  )
}

const chartConfig = {
  dr: { label: 'DR', color: 'var(--primary)' }
} satisfies ChartConfig

/** The row's site name, which opens its panel. */
function SiteLink({ domain }: { domain: string }) {
  const { onOpen } = useTableContext()
  return (
    <Button
      variant="link"
      className="w-fit px-0 text-left text-foreground"
      onClick={() => onOpen(domain)}
    >
      {domain}
    </Button>
  )
}

/** The block's row viewer as the site panel: a drawer from the right (a bottom sheet on phones). */
function SitePanel({
  site,
  open,
  onOpenChange
}: {
  site: AccountSite
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const isMobile = useIsMobile()
  const { urls, dofollow, onRelease } = useTableContext()
  const [rechecking, setRechecking] = React.useState(false)
  const history = site.history.map(point => ({
    day: DAY.format(new Date(point.checkedAt)),
    dr: point.domainRating
  }))
  return (
    <Drawer swipeDirection={isMobile ? 'down' : 'right'} open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="gap-1">
          <DrawerTitle>{site.domain}</DrawerTitle>
          <DrawerDescription>{site.title ?? 'No title yet.'}</DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 text-sm">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-muted-foreground">Domain Rating</p>
              <p className="font-mono text-4xl font-semibold tabular-nums">{site.dr ?? '—'}</p>
            </div>
            <ChangeBadge change={site.change} />
          </div>
          {!isMobile && history.length > 1 ? (
            <ChartContainer config={chartConfig}>
              <AreaChart accessibilityLayer data={history} margin={{ left: 0, right: 10 }}>
                <CartesianGrid vertical={false} />
                <YAxis hide domain={['dataMin - 4', 'dataMax + 2']} />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                />
                <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
                <Area
                  dataKey="dr"
                  type="natural"
                  fill="var(--color-dr)"
                  fillOpacity={0.4}
                  stroke="var(--color-dr)"
                />
              </AreaChart>
            </ChartContainer>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">
              {site.checkedAt
                ? `Checked ${DAY.format(new Date(site.checkedAt))}`
                : site.dr === null
                  ? 'Not checked yet'
                  : 'Not checked in the last year'}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={rechecking}
              onClick={async () => {
                setRechecking(true)
                await onRecheck(site.domain, () => router.refresh())
                setRechecking(false)
              }}
            >
              <RefreshCwIcon data-icon="inline-start" />
              Recheck
            </Button>
          </div>
          <Separator />
          <div className="flex flex-col gap-3">
            <p className="font-medium">Badge</p>
            <BadgeEmbed {...badgeFor(site, urls)} />
          </div>
          <Separator />
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">Link from dr.serp.co</p>
              <p className="text-muted-foreground">
                {dofollow
                  ? 'Dofollow while you claim it on a plan; nofollow once released.'
                  : 'Nofollow until your plan is active again.'}
              </p>
            </div>
            <LinkBadge />
          </div>
        </div>
        <DrawerFooter>
          <Link
            href={`/sites/${encodeURIComponent(site.domain)}`}
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            Public page
            <ExternalLinkIcon data-icon="inline-end" />
          </Link>
          <Button variant="destructive" onClick={() => onRelease(site.domain)}>
            Release
          </Button>
          <DrawerClose render={<Button variant="ghost" />}>Done</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
