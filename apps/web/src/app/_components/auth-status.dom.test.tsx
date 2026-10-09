// The header's sign-out must reach Better Auth: a POST without a JSON content type is refused
// (415), which once left the server session alive while the header showed "Log in".
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() })
}))

import { AuthStatus } from './auth-status'

const fetchMock = vi.fn()

beforeEach(() => {
  window.localStorage.setItem('dr-auth-email', 'owner@example.com')
  fetchMock.mockImplementation(async (url: string) =>
    url === '/api/auth/get-session'
      ? new Response(JSON.stringify({ user: { email: 'owner@example.com' } }), { status: 200 })
      : new Response(JSON.stringify({ success: true }), { status: 200 })
  )
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('AuthStatus', () => {
  it('signs out with a JSON POST that Better Auth accepts', async () => {
    render(<AuthStatus />)
    fireEvent.click(await screen.findByRole('button', { name: 'Log out' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/sign-out',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}'
        })
      )
    )
    expect(window.localStorage.getItem('dr-auth-email')).toBeNull()
  })
})
