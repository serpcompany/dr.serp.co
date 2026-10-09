// Settings: the theme toggle and sign-out.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const setTheme = vi.fn()
const assign = vi.fn()

vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'dark', setTheme }) }))

const { SignOutButton, ThemeChoice } = await import('./settings-controls')

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, assign }
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  fetchMock.mockReset()
  setTheme.mockReset()
  assign.mockReset()
})

describe('ThemeChoice', () => {
  it('presses the stored theme and sets another', async () => {
    render(<ThemeChoice />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed')).toBe('true')
    )
    fireEvent.click(screen.getByRole('button', { name: 'System' }))
    expect(setTheme).toHaveBeenCalledWith('system')
  })
})

describe('SignOutButton', () => {
  it('ends the session and goes home', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    render(<SignOutButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'))
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/auth/sign-out')
  })
})
