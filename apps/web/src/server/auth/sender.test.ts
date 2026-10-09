import { afterEach, describe, expect, it, vi } from 'vitest'

import { codeSenderFor, signInEmail } from './sender'

const code = { email: 'person@example.com', otp: '482913', expiresInSeconds: 600 }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sign-in code email', () => {
  it('shows the code as one run of digits, and says the address is not monitored', () => {
    const { subject, html, text } = signInEmail(code, 'https://dr.serp.co')
    expect(subject).toBe('Your DR Checker sign-in code')
    expect(html).toContain('<strong>482913</strong>')
    expect(text).toContain('code is 482913.')
    expect(html).toContain('isn&#39;t monitored')
    expect(text).toContain('https://dr.serp.co/add')
  })

  it('sends through useSend from the no-reply sender, and logs neither the code nor the address', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }))
    const log = vi.spyOn(console, 'info')
    const sender = codeSenderFor(
      'production',
      { USESEND_API_KEY: 'us_key' },
      'https://dr.serp.co',
      fetcher
    )
    expect(sender.ready()).toBe(true)
    await sender.send(code)
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://app.usesend.com/api/v1/emails')
    expect(JSON.parse(String(init.body))).toMatchObject({
      to: 'person@example.com',
      from: 'DR Checker <no-reply@mail.serp.co>'
    })
    expect(log).not.toHaveBeenCalled()
  })

  it('names only the status when useSend refuses', async () => {
    const fetcher = vi.fn(async () => new Response('nope', { status: 422 }))
    const sender = codeSenderFor(
      'staging',
      { USESEND_API_KEY: 'us_key' },
      'https://staging-dr.serp.co',
      fetcher
    )
    await expect(sender.send(code)).rejects.toThrow('useSend refused the sign-in email (422)')
  })

  it('is not ready in a deployed environment without a key, and prints codes only locally', async () => {
    expect(codeSenderFor('production', {}, 'https://dr.serp.co').ready()).toBe(false)
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const local = codeSenderFor('local', {}, 'http://localhost:3000')
    expect(local.ready()).toBe(true)
    await local.send(code)
    expect(log).toHaveBeenCalledWith('[local sign-in code] person@example.com: 482913')
  })
})
