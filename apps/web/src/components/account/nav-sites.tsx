'use client'

import {
  CopyIcon,
  ExternalLinkIcon,
  GlobeIcon,
  MoreHorizontalIcon,
  PanelRightOpenIcon
} from 'lucide-react'
import Link from 'next/link'
import type { MockSite } from '@/app/account/_mock/data'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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

// dashboard-01's NavDocuments, listing the highest-DR claimed sites.
export function NavSites({ items, total }: { items: MockSite[]; total: number }) {
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
            <SidebarMenuBadge className="font-mono tabular-nums group-hover/menu-item:opacity-0">
              {item.dr}
            </SidebarMenuBadge>
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
                <DropdownMenuItem>
                  <PanelRightOpenIcon />
                  <span>Open</span>
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href={`/sites/${item.domain}`} />}>
                  <ExternalLinkIcon />
                  <span>Public page</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <CopyIcon />
                  <span>Copy badge code</span>
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
