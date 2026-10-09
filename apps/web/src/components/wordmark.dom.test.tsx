// The header's home link is named by the wordmark: it must read "SERP DR", with a real space.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { Wordmark } from './wordmark'

afterEach(cleanup)

it('reads "SERP DR" as a link name', () => {
  render(
    <a href="/">
      <Wordmark />
      <span className="sr-only"> home</span>
    </a>
  )
  expect(screen.getByRole('link').textContent?.replace(/\s+/g, ' ').trim()).toBe('SERP DR home')
})
