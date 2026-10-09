import type { Metadata } from 'next'
import { AppSidebar } from '@/components/account/app-sidebar'
import { SiteHeader } from '@/components/account/site-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { planLabel } from '@/lib/account'
import { currentAccount } from '@/server/account'

export const metadata: Metadata = {
  title: 'Account | SERP DR',
  robots: { index: false, follow: false }
}

// dashboard-01's page shell (#140 mockups): an inset sidebar and the header around each account
// page. Signed out, there is no shell: each page redirects to /login and back to itself. If the
// account can't load, the root error boundary (src/app/error.tsx) shows instead.
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const account = await currentAccount()
  if (!account) return children
  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': 'calc(var(--spacing) * 72)',
          '--header-height': 'calc(var(--spacing) * 12)'
        } as React.CSSProperties
      }
    >
      <AppSidebar
        variant="inset"
        email={account.email}
        planLabel={planLabel(account.plan)}
        sites={account.sites}
      />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">{children}</div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
