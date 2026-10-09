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
import * as React from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { HISTORY, type MockSite } from '@/app/account/_mock/data'
import { BadgeEmbed } from '@/components/badges/badge-embed'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  DrawerTitle,
  DrawerTrigger
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

// dashboard-01's DataTable for the claimed sites. Differences from the block: no drag handles
// (sites sort by DR, not by hand), the tabs filter by DR change, and the row viewer is the site
// panel (DR history, badge, link, recheck, release).

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

const columnHelper = createColumnHelper<typeof features, MockSite>()

export function ChangeBadge({ change }: { change: number }) {
  return (
    <Badge variant="outline" className="px-1.5 text-muted-foreground">
      {change > 0 ? (
        <TrendingUpIcon className="text-primary" />
      ) : change < 0 ? (
        <TrendingDownIcon className="text-destructive" />
      ) : (
        <MinusIcon />
      )}
      {change > 0 ? `+${change}` : change < 0 ? change : 'Steady'}
    </Badge>
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
    cell: ({ row }) => <SitePanel site={row.original} />,
    enableHiding: false
  }),
  columnHelper.accessor('dr', {
    header: () => <div className="w-full text-right">DR</div>,
    cell: ({ row }) => (
      <div className="text-right font-mono text-base font-semibold tabular-nums">
        {row.original.dr}
      </div>
    )
  }),
  columnHelper.accessor('change', {
    header: 'This month',
    cell: ({ row }) => <ChangeBadge change={row.original.change} />
  }),
  columnHelper.accessor('checkedAt', {
    header: 'Last check',
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.checkedAt}</span>
  }),
  columnHelper.accessor('link', {
    header: 'Link',
    cell: () => (
      <Badge variant="outline" className="px-1.5 text-muted-foreground">
        <CircleCheckIcon className="text-primary" />
        Dofollow
      </Badge>
    )
  }),
  columnHelper.display({
    id: 'actions',
    cell: ({ row }) => (
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
          <span className="sr-only">Actions for {row.original.domain}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem>
            <RefreshCwIcon />
            Recheck DR
          </DropdownMenuItem>
          <DropdownMenuItem>
            <CopyIcon />
            Copy badge code
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href={`/sites/${row.original.domain}`} />}>
            <ExternalLinkIcon />
            Public page
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive">Release</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  })
])

const VIEWS = [
  { value: 'all', label: 'All sites', filter: () => true },
  { value: 'rising', label: 'Rising', filter: (site: MockSite) => site.change > 0 },
  { value: 'falling', label: 'Falling', filter: (site: MockSite) => site.change < 0 }
]

export function SitesTable({
  data,
  openSite,
  empty
}: {
  data: MockSite[]
  /** A site whose panel starts open (mockup screenshots). */
  openSite?: string
  empty?: React.ReactNode
}) {
  const [view, setView] = React.useState('all')
  const [rowSelection, setRowSelection] = React.useState({})
  const isMobile = useIsMobile()
  const [columnVisibility, setColumnVisibility] = React.useState<ColumnVisibilityState>({})
  // On phones the secondary columns start hidden; Columns brings them back.
  React.useEffect(() => {
    if (isMobile) setColumnVisibility({ checkedAt: false, link: false })
  }, [isMobile])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'dr', desc: true }])
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 10 })
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
  return (
    <OpenSiteContext.Provider value={openSite}>
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
                  .filter(column => typeof column.accessorFn !== 'undefined' && column.getCanHide())
                  .map(column => (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={value => column.toggleVisibility(!!value)}
                    >
                      {{ dr: 'DR', change: 'This month', checkedAt: 'Last check', link: 'Link' }[
                        column.id
                      ] ?? column.id}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href="/account/sites?state=add" />}
            >
              <PlusIcon />
              <span className="hidden lg:inline">Add site</span>
            </Button>
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
                  <div className="flex w-fit items-center justify-center text-sm font-medium">
                    Page {table.state.pagination.pageIndex + 1} of {table.getPageCount()}
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
    </OpenSiteContext.Provider>
  )
}

const OpenSiteContext = React.createContext<string | undefined>(undefined)

const chartConfig = {
  dr: { label: 'DR', color: 'var(--primary)' }
} satisfies ChartConfig

/** The block's row viewer as the site panel: a drawer from the right (a bottom sheet on phones). */
function SitePanel({ site }: { site: MockSite }) {
  const isMobile = useIsMobile()
  const openSite = React.useContext(OpenSiteContext)
  const history = HISTORY.map(point => ({
    month: new Date(point.checkedAt).toLocaleDateString('en-US', { month: 'short' }),
    dr: point.domainRating - (54 - site.dr)
  }))
  return (
    <Drawer swipeDirection={isMobile ? 'down' : 'right'} defaultOpen={openSite === site.domain}>
      <DrawerTrigger
        render={<Button variant="link" className="w-fit px-0 text-left text-foreground" />}
      >
        {site.domain}
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="gap-1">
          <DrawerTitle>{site.domain}</DrawerTitle>
          <DrawerDescription>{site.title}</DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 text-sm">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-muted-foreground">Domain Rating</p>
              <p className="font-mono text-4xl font-semibold tabular-nums">{site.dr}</p>
            </div>
            <ChangeBadge change={site.change} />
          </div>
          {!isMobile && (
            <ChartContainer config={chartConfig}>
              <AreaChart accessibilityLayer data={history} margin={{ left: 0, right: 10 }}>
                <CartesianGrid vertical={false} />
                <YAxis hide domain={['dataMin - 4', 'dataMax + 2']} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
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
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Checked {site.checkedAt} · weekly</span>
            <Button variant="outline" size="sm">
              <RefreshCwIcon />
              Recheck
            </Button>
          </div>
          <Separator />
          <div className="flex flex-col gap-3">
            <p className="font-medium">Badge</p>
            <BadgeEmbed
              domain={site.domain}
              dr={site.dr}
              linkUrl={`https://dr.serp.co/sites/${site.domain}`}
              badgeUrl={`/badge/${site.domain}`}
            />
          </div>
          <Separator />
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">Link from dr.serp.co</p>
              <p className="text-muted-foreground">
                Dofollow while you claim it; nofollow once released.
              </p>
            </div>
            <Badge variant="outline" className="px-1.5 text-muted-foreground">
              <CircleCheckIcon className="text-primary" />
              Dofollow
            </Badge>
          </div>
        </div>
        <DrawerFooter>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/sites/${site.domain}`} />}
          >
            Public page
            <ExternalLinkIcon />
          </Button>
          <Button
            variant="destructive"
            nativeButton={false}
            render={<Link href={`/account/sites?state=release&site=${site.domain}`} />}
          >
            Release
          </Button>
          <DrawerClose render={<Button variant="ghost" />}>Done</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
