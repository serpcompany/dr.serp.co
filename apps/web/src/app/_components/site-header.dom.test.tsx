// The header's home link is named by the wordmark: "SERP DR home", with a real space.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams()
}))

import { SiteHeader } from './site-header'

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('null', { status: 200 }))
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('names the home link "SERP DR home"', () => {
  render(<SiteHeader />)
  const home = screen.getByRole('link', { name: /home$/ })
  expect(home.getAttribute('href')).toBe('/')
  // The text itself, not happy-dom's computed name, which adds spaces between elements.
  expect(home.textContent?.replace(/\s+/g, ' ').trim()).toBe('SERP DR home')
})
