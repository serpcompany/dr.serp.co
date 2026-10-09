'use client'

import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type Row,
  type SortingState,
  useReactTable,
  type VisibilityState
} from '@tanstack/react-table'
import * as React from 'react'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'

type ColumnMetaClassNames = {
  headerClassName?: string
  cellClassName?: string
}

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  rowComponent?: React.ReactNode
  onRowClick?: (row: Row<TData>) => void
  defaultPageSize?: number
  defaultPageIndex?: number
  defaultSorting?: SortingState
  defaultColumnVisibility?: VisibilityState
  defaultColumnFilters?: ColumnFiltersState

  columnFilters?: ColumnFiltersState
  setColumnFilters?: React.Dispatch<React.SetStateAction<ColumnFiltersState>>
  sorting?: SortingState
  setSorting?: React.Dispatch<React.SetStateAction<SortingState>>
}

export function DataTable<TData, TValue>({
  columns,
  data,
  rowComponent,
  onRowClick,
  defaultPageSize = 10,
  defaultPageIndex = 0,
  defaultSorting = [],
  defaultColumnVisibility = {},
  defaultColumnFilters = [],
  columnFilters,
  setColumnFilters,
  sorting,
  setSorting
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = React.useState({})
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(defaultColumnVisibility)
  const [internalColumnFilters, setInternalColumnFilters] =
    React.useState<ColumnFiltersState>(defaultColumnFilters)
  const [internalSorting, setInternalSorting] = React.useState<SortingState>(defaultSorting)

  const columnFiltersState = columnFilters ?? internalColumnFilters
  const setColumnFiltersState = setColumnFilters ?? setInternalColumnFilters
  const sortingState = sorting ?? internalSorting
  const setSortingState = setSorting ?? setInternalSorting

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting: sortingState,
      columnVisibility,
      rowSelection,
      columnFilters: columnFiltersState
    },
    initialState: {
      pagination: {
        pageIndex: defaultPageIndex,
        pageSize: defaultPageSize
      }
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSortingState,
    onColumnFiltersChange: setColumnFiltersState,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => Boolean(rowComponent)
  })

  return (
    <div className="grid gap-2">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map(headerGroup => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map(header => {
                const meta = header.column.columnDef.meta as unknown as
                  | ColumnMetaClassNames
                  | undefined

                return (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    className={meta?.headerClassName}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map(row => (
              <React.Fragment key={row.id}>
                <TableRow
                  data-state={(row.getIsSelected() || row.getIsExpanded()) && 'selected'}
                  onClick={() => onRowClick?.(row)}
                  className="data-[state=selected]:bg-muted/50"
                >
                  {row.getVisibleCells().map(cell => {
                    const meta = cell.column.columnDef.meta as unknown as
                      | ColumnMetaClassNames
                      | undefined

                    return (
                      <TableCell key={cell.id} className={meta?.cellClassName}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    )
                  })}
                </TableRow>
                {row.getIsExpanded() ? (
                  <TableRow className="hover:bg-background">
                    <TableCell className="p-0" colSpan={row.getVisibleCells().length}>
                      {rowComponent}
                    </TableCell>
                  </TableRow>
                ) : null}
              </React.Fragment>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
