// The add-site dialog: look a domain up, then claim it; each refusal has its message.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const replace = vi.fn()
const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn() })
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { AddSiteDialog } = await import('./add-site-dialog')

const fetchMock = vi.fn()
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  fetchMock.mockReset()
  replace.mockReset()
  refresh.mockReset()
})

async function lookUp(value: string) {
  const dialog = await screen.findByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('Domain'), { target: { value } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Look up' }))
  return dialog
}

const found = (patch: Record<string, unknown> = {}) =>
  json(200, {
    domain: 'stripe.com',
    dr: 92,
    title: 'Stripe',
    owner: 'nobody',
    note: null,
    ...patch
  })

describe('AddSiteDialog', () => {
  it('looks up the typed domain, then claims it and opens its panel', async () => {
    fetchMock.mockResolvedValueOnce(found()).mockResolvedValueOnce(json(200, { ok: true }))
    render(<AddSiteDialog open canClaim plan="paid" limit={25} />)
    const dialog = await lookUp('https://Stripe.com/pricing')
    expect(await within(dialog).findByText('92')).toBeTruthy()
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ domain: 'stripe.com' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Claim stripe.com' }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/account/sites?site=stripe.com'))
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/claims')
    expect(refresh).toHaveBeenCalled()
  })

  it('says when someone else owns the site, and offers no claim', async () => {
    fetchMock.mockResolvedValueOnce(found({ owner: 'other' }))
    render(<AddSiteDialog open canClaim plan="paid" limit={25} />)
    const dialog = await lookUp('stripe.com')
    expect(await within(dialog).findByText('stripe.com is claimed by another account')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Claim stripe.com' })).toHaveProperty(
      'disabled',
      true
    )
  })

  it('turns a 409 on claim into the claimed-by-another message', async () => {
    fetchMock
      .mockResolvedValueOnce(found())
      .mockResolvedValueOnce(json(409, { error: 'Claimed by another account' }))
    render(<AddSiteDialog open canClaim plan="paid" limit={25} />)
    const dialog = await lookUp('stripe.com')
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Claim stripe.com' }))
    expect(await within(dialog).findByText('stripe.com is claimed by another account')).toBeTruthy()
  })

  it('points a full plan at billing, before or after the claim', async () => {
    fetchMock.mockResolvedValueOnce(found())
    render(<AddSiteDialog open canClaim={false} plan="paid" limit={25} />)
    const dialog = await lookUp('stripe.com')
    expect(await within(dialog).findByText('All 25 sites on your plan are claimed')).toBeTruthy()
    expect(
      within(dialog)
        .getByRole('link', { name: /Change plan/ })
        .getAttribute('href')
    ).toBe('/billing')
    cleanup()
    fetchMock
      .mockResolvedValueOnce(found())
      .mockResolvedValueOnce(json(402, { error: 'Upgrade required', code: 'upgrade_required' }))
    render(<AddSiteDialog open canClaim plan="paid" limit={25} />)
    const again = await lookUp('stripe.com')
    fireEvent.click(await within(again).findByRole('button', { name: 'Claim stripe.com' }))
    expect(await within(again).findByText('All 25 sites on your plan are claimed')).toBeTruthy()
  })

  it('follows the plan after a refresh, and names a failed payment or no plan', async () => {
    fetchMock.mockResolvedValue(found())
    const { rerender } = render(<AddSiteDialog open canClaim={false} plan="paid" limit={12} />)
    const dialog = await lookUp('stripe.com')
    expect(await within(dialog).findByText('All 12 sites on your plan are claimed')).toBeTruthy()
    // A site released elsewhere: the server's refresh frees a slot, and Claim comes back.
    rerender(<AddSiteDialog open canClaim plan="paid" limit={12} />)
    expect(within(dialog).queryByText('All 12 sites on your plan are claimed')).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Claim stripe.com' })).toHaveProperty(
      'disabled',
      false
    )
    rerender(<AddSiteDialog open canClaim={false} plan="past-due" limit={12} />)
    expect(within(dialog).getByText('Your last payment failed')).toBeTruthy()
    rerender(<AddSiteDialog open canClaim={false} plan="none" limit={12} />)
    expect(within(dialog).getByText('Claiming needs a plan')).toBeTruthy()
  })

  it('opens empty again after a claim', async () => {
    fetchMock.mockResolvedValueOnce(found()).mockResolvedValueOnce(json(200, { ok: true }))
    const { rerender } = render(<AddSiteDialog open canClaim plan="paid" limit={25} />)
    const dialog = await lookUp('stripe.com')
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Claim stripe.com' }))
    await waitFor(() => expect(replace).toHaveBeenCalled())
    rerender(<AddSiteDialog open={false} canClaim plan="paid" limit={25} />)
    rerender(<AddSiteDialog open canClaim plan="paid" limit={25} />)
    const reopened = await screen.findByRole('dialog')
    expect(within(reopened).queryByText('stripe.com')).toBeNull()
    expect((within(reopened).getByLabelText('Domain') as HTMLInputElement).value).toBe('')
  })

  it('says a site is already yours, and when its DR could not be looked up', async () => {
    fetchMock.mockResolvedValueOnce(found({ owner: 'you' }))
    render(<AddSiteDialog open canClaim plan="paid" limit={25} />)
    const dialog = await lookUp('stripe.com')
    expect(await within(dialog).findByText('stripe.com is already yours')).toBeTruthy()
    fetchMock.mockResolvedValueOnce(found({ dr: null, note: 'New lookups are limited right now.' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Look up' }))
    // The note as the server wrote it, without a second "try again".
    expect(await within(dialog).findByText('New lookups are limited right now.')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Claim stripe.com' })).toHaveProperty(
      'disabled',
      true
    )
  })

  it('shows the lookup’s refusal, and a lost connection', async () => {
    fetchMock.mockResolvedValueOnce(json(400, { error: 'Enter a domain, like example.com.' }))
    render(<AddSiteDialog open canClaim plan="paid" limit={25} />)
    const dialog = await lookUp('not a domain')
    expect(await within(dialog).findByText('Enter a domain, like example.com.')).toBeTruthy()
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    fireEvent.change(within(dialog).getByLabelText('Domain'), { target: { value: 'stripe.com' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Look up' }))
    expect(await within(dialog).findByText(/Couldn't reach dr.serp.co/)).toBeTruthy()
  })
})
