'use client'

import {
  ChevronsUpDownIcon,
  ExternalLinkIcon,
  GaugeIcon,
  GlobeIcon,
  LogOutIcon,
  ReceiptTextIcon,
  ScrollTextIcon,
  ShieldCheckIcon
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar
} from '@/components/ui/sidebar'

const NAV = [
  { title: 'Sites', url: '/admin/sites', icon: GlobeIcon, badge: '468' },
  { title: 'Subscriptions', url: '/admin/subscriptions', icon: ReceiptTextIcon, badge: '4' },
  { title: 'Billing audit', url: '/admin/billing-audit', icon: ScrollTextIcon, badge: '1' },
  { title: 'Admins', url: '/admin/admins', icon: ShieldCheckIcon }
]

export function AdminSidebar() {
  const pathname = usePathname()
  const { isMobile } = useSidebar()
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/admin/sites" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <GaugeIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">SERP DR</span>
                <span className="truncate text-xs">Admin</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarMenu>
            {NAV.map(item => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  tooltip={item.title}
                  isActive={pathname?.startsWith(item.url)}
                  render={<Link href={item.url} />}
                >
                  <item.icon />
                  <span>{item.title}</span>
                </SidebarMenuButton>
                {item.badge ? <SidebarMenuBadge>{item.badge}</SidebarMenuBadge> : null}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />}
              >
                <Avatar>
                  <AvatarFallback>DS</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Devin</span>
                  <span className="truncate text-xs">devin@serp.example</span>
                </div>
                <ChevronsUpDownIcon className="ml-auto size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56"
                side={isMobile ? 'bottom' : 'right'}
                align="end"
                sideOffset={4}
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel>devin@serp.example</DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem render={<Link href="/" />}>
                    <ExternalLinkIcon />
                    Back to the site
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <LogOutIcon />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
