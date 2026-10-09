// getSessionEmail fails closed: a failed lookup (D1 down) reads as signed out, and its log line
// holds neither the session token nor the query.
import { DrizzleQueryError } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const getSession = vi.fn()
vi.mock('./index', () => ({
  getAuth: async () => ({ ok: true, auth: { api: { getSession } } })
}))

const { getSessionEmail } = await import('./session')

const TOKEN = 'sessiontoken0123456789abcdef'
const cookie = `__Secure-dr-serp.session_token=${TOKEN}.signature`

afterEach(() => {
  vi.restoreAllMocks()
  getSession.mockReset()
})

describe('getSessionEmail', () => {
  it('answers the verified email, lowercased', async () => {
    getSession.mockResolvedValue({ user: { email: 'Owner@Example.com', emailVerified: true } })
    expect(await getSessionEmail({ headers: new Headers({ cookie }) })).toBe('owner@example.com')
  })

  it('reads a failed lookup as signed out, and logs it scrubbed', async () => {
    getSession.mockRejectedValue(
      new DrizzleQueryError(
        'select * from "sessions" where "token" = ?',
        [TOKEN],
        new Error('D1_ERROR: no such table: sessions')
      )
    )
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await getSessionEmail({ headers: new Headers({ cookie }) })).toBeNull()
    expect(error).toHaveBeenCalledTimes(1)
    const line = error.mock.calls[0]?.map(String).join(' ') ?? ''
    expect(line).toContain('D1_ERROR')
    expect(line).not.toContain(TOKEN)
    expect(line).not.toContain('Failed query')
  })

  it('skips the lookup without a session cookie', async () => {
    expect(await getSessionEmail({ headers: new Headers() })).toBeNull()
    expect(getSession).not.toHaveBeenCalled()
  })
})
