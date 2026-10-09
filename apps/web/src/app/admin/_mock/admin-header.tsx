'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Fragment } from 'react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

const LABELS: Record<string, string> = {
  sites: 'Sites',
  subscriptions: 'Subscriptions',
  'billing-audit': 'Billing audit',
  admins: 'Admins'
}

export function AdminHeader() {
  const parts = (usePathname() ?? '').split('/').filter(Boolean).slice(1)
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />
        <Breadcrumb>
          <BreadcrumbList>
            {parts.map((part, index) => {
              const href = `/admin/${parts.slice(0, index + 1).join('/')}`
              const label = LABELS[part] ?? decodeURIComponent(part)
              const last = index === parts.length - 1
              return (
                <Fragment key={href}>
                  {index > 0 ? <BreadcrumbSeparator /> : null}
                  <BreadcrumbItem>
                    {last ? (
                      <BreadcrumbPage>{label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink render={<Link href={href} />}>{label}</BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </header>
  )
}
