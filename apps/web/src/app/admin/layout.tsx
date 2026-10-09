import type { Metadata } from 'next'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AdminHeader } from './_mock/admin-header'
import { AdminSidebar } from './_mock/admin-sidebar'

export const metadata: Metadata = { title: 'Admin · SERP DR', robots: { index: false } }

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AdminSidebar />
      <SidebarInset>
        <AdminHeader />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
