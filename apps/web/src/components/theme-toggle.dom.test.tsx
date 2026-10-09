// The footer's theme picker on Base UI's Select: it renders a placeholder until next-themes knows
// the theme, then stays a controlled Select (the old one switched from uncontrolled to controlled
// and logged a warning on every page).
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ThemeProvider } from 'next-themes'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ThemeToggle } from './theme-toggle'

function renderToggle() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ThemeToggle />
    </ThemeProvider>
  )
}

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  document.documentElement.className = ''
})

describe('ThemeToggle', () => {
  it('shows the current theme without logging a controlled-state warning', async () => {
    const error = vi.spyOn(console, 'error')
    const warn = vi.spyOn(console, 'warn')
    renderToggle()

    expect(await screen.findByText('System')).toBeTruthy()
    const logged = [...error.mock.calls, ...warn.mock.calls].map(call => String(call[0]))
    expect(logged.filter(message => /controlled/i.test(message))).toEqual([])
  })

  it('switches the theme from the list', async () => {
    renderToggle()
    await screen.findByText('System')

    await act(async () => {
      fireEvent.click(screen.getByRole('combobox'))
    })
    // Base UI commits a mouse click only when the press started on the item, as a real one does.
    const dark = await screen.findByRole('option', { name: 'Dark' })
    fireEvent.pointerDown(dark, { pointerType: 'mouse' })
    fireEvent.click(dark)

    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true))
    expect(window.localStorage.getItem('theme')).toBe('dark')
  })
})
