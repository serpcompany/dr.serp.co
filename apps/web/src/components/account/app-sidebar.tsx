'use client'

import {
  CreditCardIcon,
  ExternalLinkIcon,
  LayoutDashboardIcon,
  ListIcon,
  TagIcon
} from 'lucide-react'
import Link from 'next/link'
import type { ComponentProps, MouseEvent } from 'react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from '@/components/ui/sidebar'
import { Wordmark } from '@/components/wordmark'
import type { AccountSite } from '@/lib/account'
import { NavMain } from './nav-main'
import { NavSecondary } from './nav-secondary'
import { NavSites } from './nav-sites'
import { NavUser } from './nav-user'

// dashboard-01's AppSidebar with dr.serp.co's content: the account pages, the highest-DR claimed
// sites (its "Documents" group), the public site, and the user menu.
const NAV_MAIN = [
  { title: 'Overview', url: '/account', icon: <LayoutDashboardIcon />, exact: true },
  { title: 'Sites', url: '/account/sites', icon: <ListIcon /> },
  // Billing and Settings move into the account with #143; until then Billing is today's page.
  { title: 'Billing', url: '/billing', icon: <CreditCardIcon /> }
]

const NAV_SECONDARY = [
  { title: 'Pricing', url: '/pricing', icon: <TagIcon /> },
  { title: 'All sites on dr.serp.co', url: '/sites', icon: <ExternalLinkIcon /> }
]

export type AccountSidebarProps = {
  email: string
  /** "25-site plan", "Free plan". */
  planLabel: string
  sites: AccountSite[]
}

export function AppSidebar({
  email,
  planLabel,
  sites,
  ...props
}: AccountSidebarProps & ComponentProps<typeof Sidebar>) {
  const { isMobile, state, setOpenMobile } = useSidebar()
  // On phones the sidebar is a sheet: following any link in it (the user menu's too, through its
  // portal) closes it, even a link to the page already open.
  function closeOnLink(event: MouseEvent) {
    if (isMobile && event.target instanceof Element && event.target.closest('a[href]')) {
      setOpenMobile(false)
    }
  }
  return (
    <Sidebar
      collapsible="offcanvas"
      // Collapsed on desktop, the sidebar slides off screen: keep its links out of the tab order.
      inert={!isMobile && state === 'collapsed' ? true : undefined}
      {...props}
    >
      <SidebarHeader onClick={closeOnLink}>
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
      <SidebarContent onClick={closeOnLink}>
        <NavMain items={NAV_MAIN} />
        {sites.length > 0 ? <NavSites items={sites.slice(0, 3)} total={sites.length} /> : null}
        <NavSecondary items={NAV_SECONDARY} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter onClick={closeOnLink}>
        <NavUser user={{ email, initials: email.slice(0, 2).toUpperCase(), plan: planLabel }} />
      </SidebarFooter>
    </Sidebar>
  )
}
