import { beforeEach, describe, expect, it, vi } from 'vitest'

const checkRateLimit = vi.hoisted(() => vi.fn())

vi.mock('./rate-limit.mjs', () => ({ checkRateLimit }))

import { createOtp } from './otp-store.mjs'

describe('createOtp', () => {
  beforeEach(() => {
    checkRateLimit.mockReset()
  })

  it('counts the resend cooldown per email in the shared rate limiter', async () => {
    checkRateLimit.mockResolvedValue({ allowed: true, remaining: 0, retryAfterMs: 60000 })

    const result = await createOtp('user@example.com')

    expect(checkRateLimit).toHaveBeenCalledWith({
      key: 'otp-resend:user@example.com',
      points: 1,
      duration: 60
    })
    expect(result).toMatchObject({ ok: true, code: expect.stringMatching(/^\d{6}$/) })
  })

  it("refuses a second code within the cooldown, with the limiter's retry time", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterMs: 42000 })

    expect(await createOtp('user@example.com')).toEqual({
      ok: false,
      unavailable: false,
      retryAfterMs: 42000
    })
  })

  it('passes a limiter outage on as unavailable', async () => {
    checkRateLimit.mockResolvedValue({
      allowed: false,
      unavailable: true,
      remaining: 0,
      retryAfterMs: 60000
    })

    expect(await createOtp('user@example.com')).toMatchObject({ ok: false, unavailable: true })
  })
})
