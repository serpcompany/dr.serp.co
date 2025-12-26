"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { ColumnDef } from "@tanstack/react-table"

import { DataTable } from "@/components/ui/data-table/data-table"

type SiteRow = {
  domain: string
  domain_rating: number | null
  updated_at: string | null
}

function getColumns(offset: number): ColumnDef<SiteRow>[] {
  return [
    {
      id: "rank",
      header: "#",
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">{offset + row.index + 1}</span>
      ),
      enableSorting: false,
      enableHiding: false,
      meta: {
        headerClassName: "w-[70px] text-center",
        cellClassName: "text-center",
      },
    },
    {
      accessorKey: "domain",
      header: "Domain",
      cell: ({ row }) => {
        const domain = String(row.getValue("domain") ?? "")
        return (
          <Link href={`/sites/${encodeURIComponent(domain)}`} className="text-foreground hover:underline">
            {domain}
          </Link>
        )
      },
      enableSorting: false,
      enableHiding: false,
      meta: {
        cellClassName: "max-w-[420px] truncate",
      },
    },
    {
      accessorKey: "domain_rating",
      header: () => <div className="text-right">DR</div>,
      cell: ({ row }) => {
        const value = row.getValue("domain_rating")
        const dr = typeof value === "number" && Number.isFinite(value) ? value : null
        return <div className="text-right font-medium tabular-nums">{dr === null ? "—" : dr}</div>
      },
      enableSorting: false,
      enableHiding: false,
      meta: {
        headerClassName: "text-right",
        cellClassName: "text-right",
      },
    },
  ]
}

export function SitesDataTable({ rows, offset }: { rows: SiteRow[]; offset: number }) {
  const router = useRouter()
  const columns = useMemo(() => getColumns(offset), [offset])

  return (
    <DataTable
      columns={columns}
      data={rows}
      defaultPageSize={rows.length}
      onRowClick={(row) => router.push(`/sites/${encodeURIComponent(row.original.domain)}`)}
    />
  )
}

