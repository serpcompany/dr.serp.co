'use client'

import {
  CreditCardIcon,
  ExternalLinkIcon,
  LayoutDashboardIcon,
  ListIcon,
  SettingsIcon,
  TagIcon
} from 'lucide-react'
import Link from 'next/link'
import type * as React from 'react'
import { SITES, USER } from '@/app/account/_mock/data'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar'
import { Wordmark } from '@/components/wordmark'
import { NavMain } from './nav-main'
import { NavSecondary } from './nav-secondary'
import { NavSites } from './nav-sites'
import { NavUser } from './nav-user'

// dashboard-01's AppSidebar with dr.serp.co's content: the account pages, the highest-DR claimed
// sites (its "Documents" group), the public site, and the user menu.
const data = {
  navMain: [
    { title: 'Overview', url: '/account', icon: <LayoutDashboardIcon />, exact: true },
    { title: 'Sites', url: '/account/sites', icon: <ListIcon /> },
    { title: 'Billing', url: '/account/billing', icon: <CreditCardIcon /> },
    { title: 'Settings', url: '/account/settings', icon: <SettingsIcon /> }
  ],
  navSecondary: [
    { title: 'Pricing', url: '/pricing', icon: <TagIcon /> },
    { title: 'All sites on dr.serp.co', url: '/sites', icon: <ExternalLinkIcon /> }
  ],
  sites: [...SITES].sort((a, b) => b.dr - a.dr).slice(0, 3)
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<Link href="/account" />}
            >
              <Wordmark />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavSites items={data.sites} total={SITES.length} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={USER} />
      </SidebarFooter>
    </Sidebar>
  )
}
