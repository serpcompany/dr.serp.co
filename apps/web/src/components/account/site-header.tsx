'use client'

import { ExternalLinkIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Fragment } from 'react'
import { ModeToggle } from '@/components/mode-toggle'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

const LABELS: Record<string, string> = {
  account: 'Account',
  sites: 'Sites',
  billing: 'Billing',
  settings: 'Settings'
}

// dashboard-01's SiteHeader: the trigger, a breadcrumb in place of the title (only the current
// page on phones), "View site" and the theme toggle.
export function SiteHeader() {
  const parts = (usePathname() ?? '').split('/').filter(Boolean)
  const crumbs = parts.length === 1 ? [...parts, 'overview'] : parts
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 h-4 data-vertical:self-auto" />
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="flex-nowrap">
            {crumbs.map((part, index) => {
              const last = index === crumbs.length - 1
              const href = `/${crumbs.slice(0, index + 1).join('/')}`
              const label =
                LABELS[part] ?? (part === 'overview' ? 'Overview' : decodeURIComponent(part))
              return (
                <Fragment key={href}>
                  {index > 0 ? <BreadcrumbSeparator className="hidden md:block" /> : null}
                  <BreadcrumbItem className={last ? 'min-w-0' : 'hidden md:inline-flex'}>
                    {last ? (
                      <BreadcrumbPage className="truncate">{label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink render={<Link href={href} />}>{label}</BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="hidden sm:flex"
            nativeButton={false}
            render={<Link href="/" />}
          >
            View site
            <ExternalLinkIcon />
          </Button>
          <ModeToggle />
        </div>
      </div>
    </header>
  )
}
