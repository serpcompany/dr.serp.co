import { afterEach, describe, expect, it, vi } from 'vitest'

import { codeSenderFor, fromHeader, signInEmail } from './sender'

const code = { email: 'person@example.com', otp: '482913', expiresInSeconds: 600 }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sign-in code email', () => {
  it('keeps the code out of the subject, and shows it as one text node of bare digits', () => {
    const { subject, html, text } = signInEmail(code, 'https://dr.serp.co')
    expect(subject).toBe('Your SERP DR sign-in code')
    expect(subject).not.toMatch(/\d/)
    // One element holds exactly the digits: no spaces, separators or per-digit elements to copy.
    expect(html).toMatch(/letter-spacing:[^"]*">482913<\/p>/)
    expect(html).not.toMatch(/482\s|\s913|4<|8<|\u200b/)
    expect(text.split('\n')).toContain('482913')
    expect(html).toContain('It works for 10 minutes')
  })

  it('sends as SERP DR from whichever mailbox USESEND_FROM names', () => {
    expect(fromHeader('DR Checker <no-reply@mail.serp.co>')).toBe('SERP DR <no-reply@mail.serp.co>')
    expect(fromHeader('codes@mail.serp.co')).toBe('SERP DR <codes@mail.serp.co>')
    expect(fromHeader(undefined)).toBe('SERP DR <no-reply@mail.serp.co>')
    expect(fromHeader('not an address')).toBe('SERP DR <no-reply@mail.serp.co>')
    // Spaces inside the brackets, and the older "address (Name)" form.
    expect(fromHeader('DR Checker < codes@mail.serp.co >')).toBe('SERP DR <codes@mail.serp.co>')
    expect(fromHeader('codes@mail.serp.co (DR Checker)')).toBe('SERP DR <codes@mail.serp.co>')
    // Nothing from the secret can add a header or a second address.
    expect(fromHeader('a@b.co>\r\nBcc: x@evil.example')).toBe('SERP DR <no-reply@mail.serp.co>')
    expect(fromHeader('<a@b.co, x@evil.example>')).toBe('SERP DR <no-reply@mail.serp.co>')
  })

  it('has dark-mode styles for mail clients that honour them', () => {
    const { html } = signInEmail(code, 'https://dr.serp.co')
    expect(html).toContain('@media (prefers-color-scheme: dark)')
    for (const name of ['page', 'card', 'muted', 'code', 'rule', 'link']) {
      expect(html, name).toContain(`class="${name}"`)
    }
  })

  it('says the address is not monitored and links to the sites page', () => {
    const { html, text } = signInEmail(code, 'https://dr.serp.co')
    expect(html).toContain('isn&#39;t monitored')
    expect(html).toContain('href="https://dr.serp.co/account/sites"')
    expect(text).toContain('https://dr.serp.co/account/sites')
    expect(html).toContain('name="color-scheme" content="light dark"')
  })

  it('sends through useSend from the no-reply sender, and logs neither the code nor the address', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }))
    const log = vi.spyOn(console, 'info')
    const sender = codeSenderFor(
      'production',
      { USESEND_API_KEY: 'us_key', USESEND_FROM: 'DR Checker <no-reply@mail.serp.co>' },
      'https://dr.serp.co',
      fetcher
    )
    expect(sender.ready()).toBe(true)
    await sender.send(code)
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://app.usesend.com/api/v1/emails')
    expect(JSON.parse(String(init.body))).toMatchObject({
      to: 'person@example.com',
      from: 'SERP DR <no-reply@mail.serp.co>'
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
