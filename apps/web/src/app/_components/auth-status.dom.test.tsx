// The header's account control: "Sign in" links to /login with the way back; signed in, the
// account menu signs out with a JSON POST Better Auth accepts (a POST without a JSON content type
// is refused with 415, which once left the server session alive while the header said signed out).
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  usePathname: () => '/sites/best.serp.co'
}))

import { AuthStatus } from './auth-status'

const fetchMock = vi.fn()
const assign = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, search: '', assign, reload: vi.fn() }
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  fetchMock.mockReset()
  assign.mockReset()
  window.localStorage.clear()
})

describe('AuthStatus', () => {
  it('links to /login and back to this page when signed out', async () => {
    fetchMock.mockResolvedValue(new Response('null', { status: 200 }))
    render(<AuthStatus />)
    const link = await screen.findByRole('link', { name: 'Sign in' })
    expect(link.getAttribute('href')).toBe('/login?callbackUrl=%2Fsites%2Fbest.serp.co')
  })

  it('keeps the query string on the way back', async () => {
    fetchMock.mockResolvedValue(new Response('null', { status: 200 }))
    window.location.search = '?q=serp&page=3'
    render(<AuthStatus />)
    fireEvent.click(await screen.findByRole('link', { name: 'Sign in' }))
    expect(assign).toHaveBeenCalledWith(
      '/login?callbackUrl=%2Fsites%2Fbest.serp.co%3Fq%3Dserp%26page%3D3'
    )
  })

  it('signs out from the account menu with a JSON POST', async () => {
    window.localStorage.setItem('dr-auth-email', 'owner@example.com')
    fetchMock.mockImplementation(async (url: string) =>
      url === '/api/auth/get-session'
        ? new Response(JSON.stringify({ user: { email: 'owner@example.com' } }), { status: 200 })
        : new Response(JSON.stringify({ success: true }), { status: 200 })
    )
    render(<AuthStatus />)
    fireEvent.click(await screen.findByRole('button', { name: 'Account menu' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/sign-out',
        expect.objectContaining({ method: 'POST', body: '{}' })
      )
    )
    const init = fetchMock.mock.calls.find(([url]) => url === '/api/auth/sign-out')?.[1]
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json')
    expect(window.localStorage.getItem('dr-auth-email')).toBeNull()
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/sites/best.serp.co'))
  })
})
