import { DrizzleQueryError } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { scrubError, scrubText } from './logging'

describe('auth logging', () => {
  it("keeps D1's error and drops Drizzle's query and values", () => {
    const error = new DrizzleQueryError(
      'select * from verification where identifier = ?',
      ['sign-in-otp-victim@example.com'],
      new Error('D1_ERROR: no such table: verification')
    )
    const line = scrubError(error)
    expect(line).toBe('Error: D1_ERROR: no such table: verification')
    expect(scrubText(`boom Failed query: select 1\\nparams: victim@example.com`)).toBe(
      'boom [query withheld]'
    )
  })

  it('logs only the type of anything that is not an error or text', () => {
    expect(scrubError({ email: 'victim@example.com' })).toBe('[object]')
  })
})
