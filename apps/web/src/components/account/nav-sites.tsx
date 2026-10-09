'use client'

import { ExternalLinkIcon, GlobeIcon, MoreHorizontalIcon, PanelRightOpenIcon } from 'lucide-react'
import Link from 'next/link'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from '@/components/ui/sidebar'
import type { AccountSite } from '@/lib/account'

// dashboard-01's NavDocuments, listing the highest-DR claimed sites.
export function NavSites({ items, total }: { items: AccountSite[]; total: number }) {
  const { isMobile } = useSidebar()
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Your top sites</SidebarGroupLabel>
      <SidebarMenu>
        {items.map(item => (
          <SidebarMenuItem key={item.domain}>
            <SidebarMenuButton render={<Link href={`/account/sites?site=${item.domain}`} />}>
              <GlobeIcon />
              <span>{item.domain}</span>
            </SidebarMenuButton>
            {item.dr === null ? null : (
              <SidebarMenuBadge className="font-mono tabular-nums group-hover/menu-item:opacity-0">
                {item.dr}
              </SidebarMenuBadge>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<SidebarMenuAction showOnHover className="aria-expanded:bg-muted" />}
              >
                <MoreHorizontalIcon />
                <span className="sr-only">More for {item.domain}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-44"
                side={isMobile ? 'bottom' : 'right'}
                align={isMobile ? 'end' : 'start'}
              >
                <DropdownMenuItem render={<Link href={`/account/sites?site=${item.domain}`} />}>
                  <PanelRightOpenIcon />
                  <span>Open</span>
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href={`/sites/${item.domain}`} />}>
                  <ExternalLinkIcon />
                  <span>Public page</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        ))}
        <SidebarMenuItem>
          <SidebarMenuButton
            className="text-sidebar-foreground/70"
            render={<Link href="/account/sites" />}
          >
            <MoreHorizontalIcon className="text-sidebar-foreground/70" />
            <span>All {total} sites</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  )
}
