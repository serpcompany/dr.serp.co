// The account sidebar: a sheet on phones that closes when a link in it is followed, and out of
// the tab order when collapsed on desktop.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mobile = vi.hoisted(() => ({ value: false }))
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mobile.value }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/account',
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() })
}))

const { SidebarProvider, SidebarTrigger } = await import('@/components/ui/sidebar')
const { AppSidebar } = await import('./app-sidebar')

afterEach(() => {
  cleanup()
  mobile.value = false
})

function renderSidebar(defaultOpen = true) {
  return render(
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar email="owner@example.com" planLabel="12-site plan" sites={[]} />
      <SidebarTrigger />
    </SidebarProvider>
  )
}

describe('AppSidebar', () => {
  it('closes the phone sheet when a link in it is followed', async () => {
    mobile.value = true
    renderSidebar()
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }))
    const sheet = await screen.findByRole('dialog')
    fireEvent.click(within(sheet).getByRole('link', { name: 'Sites' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('takes the collapsed desktop sidebar out of the tab order', () => {
    const { container } = renderSidebar(false)
    const panel = container.querySelector('[data-slot=sidebar-container]')
    expect(panel?.hasAttribute('inert')).toBe(true)
    cleanup()
    const open = renderSidebar(true).container.querySelector('[data-slot=sidebar-container]')
    expect(open?.hasAttribute('inert')).toBe(false)
  })
})
