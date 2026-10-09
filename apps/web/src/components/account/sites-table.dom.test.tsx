// The sites table's actions go through the route handlers and refresh the page: recheck, copy
// the badge code, release (after a confirm). The tabs filter by DR change.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountSite } from '@/lib/account'

const refresh = vi.fn()
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/account/sites'
}))
vi.mock('sonner', () => ({ toast }))

const { SitesTable } = await import('./sites-table')

const URLS = { site: 'https://dr.serp.co', badge: 'https://dr.serp.co' }

function site(domain: string, dr: number | null, change: number | null): AccountSite {
  return {
    domain,
    title: `${domain} title`,
    dr,
    change,
    checkedAt: '2026-10-01T00:00:00.000Z',
    history: dr === null ? [] : [{ checkedAt: '2026-10-01T00:00:00.000Z', domainRating: dr }]
  }
}

const SITES = [site('serp.co', 71, 0), site('best.serp.co', 54, 2), site('serp.ly', 38, -1)]
const fetchMock = vi.fn()
const writeText = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  fetchMock.mockReset()
  writeText.mockReset()
  refresh.mockReset()
  toast.success.mockReset()
  toast.error.mockReset()
})

async function openActions(domain: string) {
  fireEvent.click(screen.getByRole('button', { name: `Actions for ${domain}` }))
  return screen.findByRole('menu')
}

describe('SitesTable', () => {
  it('lists the sites with their DR, change and link', () => {
    render(<SitesTable data={SITES} urls={URLS} dofollow />)
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows.map(row => within(row).getAllByRole('cell')[1]?.textContent)).toEqual([
      'serp.co',
      'best.serp.co',
      'serp.ly'
    ])
    expect(screen.getByText('+2')).toBeTruthy()
    expect(screen.getByText('-1')).toBeTruthy()
    expect(screen.getAllByText('Dofollow')).toHaveLength(3)
  })

  it('says nofollow without an active plan', () => {
    render(<SitesTable data={SITES} urls={URLS} dofollow={false} />)
    expect(screen.getAllByText('Nofollow')).toHaveLength(3)
  })

  it('filters by change on the tabs', () => {
    render(<SitesTable data={SITES} urls={URLS} dofollow />)
    fireEvent.click(screen.getByRole('tab', { name: /Rising/ }))
    expect(screen.queryByText('serp.ly')).toBeNull()
    expect(screen.getByText('best.serp.co')).toBeTruthy()
  })

  it('rechecks a site and refreshes, or shows why not', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    render(<SitesTable data={SITES} urls={URLS} dofollow />)
    fireEvent.click(within(await openActions('serp.co')).getByText('Recheck DR'))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/recheck',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ domain: 'serp.co' }) })
    )
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'This site was checked recently.' }), { status: 429 })
    )
    fireEvent.click(within(await openActions('serp.co')).getByText('Recheck DR'))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('This site was checked recently.'))
  })

  it('copies the badge embed code', async () => {
    writeText.mockResolvedValue(undefined)
    render(<SitesTable data={SITES} urls={URLS} dofollow />)
    fireEvent.click(within(await openActions('best.serp.co')).getByText('Copy badge code'))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(writeText.mock.calls[0]?.[0]).toContain('https://dr.serp.co/sites/best.serp.co')
    expect(writeText.mock.calls[0]?.[0]).toContain('https://dr.serp.co/badge/best.serp.co')
  })

  it('releases a site only after the confirm', async () => {
    fetchMock.mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
    render(<SitesTable data={SITES} urls={URLS} dofollow />)
    fireEvent.click(within(await openActions('serp.ly')).getByText('Release'))
    const confirm = await screen.findByRole('alertdialog')
    expect(within(confirm).getByText('Release serp.ly?')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(within(confirm).getByRole('button', { name: 'Release' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/claims',
      expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ domain: 'serp.ly' }) })
    )
  })

  it('opens a site’s panel from the URL', async () => {
    render(<SitesTable data={SITES} urls={URLS} dofollow openSite="best.serp.co" />)
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByText('best.serp.co title')).toBeTruthy()
    expect(within(panel).getByRole('button', { name: 'Release' })).toBeTruthy()
  })

  it('shows the empty state with no sites', () => {
    render(<SitesTable data={[]} urls={URLS} dofollow empty={<p>No sites yet</p>} />)
    expect(screen.getByText('No sites yet')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})
