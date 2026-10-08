// The pricing card in a browser-like DOM: a subscriber switches plans instead of buying a second
// subscription (#84).
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PricingSelector } from './pricing-selector'

type Reply = { status: number; body: unknown }

const fetchMock = vi.fn()
const sent: { url: string; body: unknown }[] = []

function answer(replies: Record<string, Reply>) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    sent.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
    const reply = replies[url] ?? { status: 404, body: {} }
    return new Response(JSON.stringify(reply.body), { status: reply.status })
  })
}

function subscriber(domains: number, billing: string, status = 'active') {
  return {
    status: 200,
    body: {
      ok: true,
      entitlement: {
        hasLivePlan: true,
        canAccessPaidFeatures: true,
        subscription: { domainsLimit: domains, billingInterval: billing, status }
      }
    }
  }
}

beforeEach(() => {
  sent.length = 0
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PricingSelector', () => {
  it('starts checkout for a visitor without a plan', async () => {
    answer({
      '/api/billing/status': { status: 401, body: { code: 'auth_required' } },
      '/api/stripe/checkout': { status: 500, body: { error: 'Checkout is down.' } }
    })
    render(<PricingSelector />)

    fireEvent.click(screen.getByRole('button', { name: '25' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start monitoring' }))

    expect(await screen.findByText('Checkout is down.')).toBeTruthy()
    expect(sent.at(-1)).toEqual({
      url: '/api/stripe/checkout',
      body: { domains: 25, billing: 'monthly' }
    })
  })

  it('starts a subscriber on their plan and switches it with change-plan', async () => {
    answer({
      '/api/billing/status': subscriber(50, 'annual'),
      '/api/stripe/change-plan': { status: 200, body: { ok: true } }
    })
    render(<PricingSelector />)

    const current = await screen.findByRole('button', { name: 'Current plan' })
    expect((current as HTMLButtonElement).disabled).toBe(true)
    expect(
      screen.getByRole('switch', { name: 'Toggle annual billing' }).getAttribute('aria-checked')
    ).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: '25' }))
    fireEvent.click(screen.getByRole('button', { name: 'Switch plan' }))

    expect(await screen.findByText(/Plan changed to 25 domains, billed yearly/)).toBeTruthy()
    expect(sent.at(-1)).toEqual({
      url: '/api/stripe/change-plan',
      body: { domains: 25, billing: 'annual' }
    })
  })

  it('shows the plan when checkout answers has_plan, instead of an error', async () => {
    answer({
      '/api/billing/status': { status: 401, body: {} },
      '/api/stripe/checkout': {
        status: 409,
        body: {
          code: 'has_plan',
          error: 'You already have a plan.',
          plan: { domains: 12, billing: 'monthly' }
        }
      }
    })
    render(<PricingSelector />)

    fireEvent.click(screen.getByRole('button', { name: 'Start monitoring' }))

    expect(await screen.findByRole('button', { name: 'Current plan' })).toBeTruthy()
    expect(screen.queryByText('You already have a plan.')).toBeNull()
  })

  it('keeps Switch plan disabled while an invoice is unpaid, and points to billing', async () => {
    answer({ '/api/billing/status': subscriber(25, 'monthly', 'past_due') })
    render(<PricingSelector />)

    await screen.findByRole('button', { name: 'Current plan' })
    fireEvent.click(screen.getByRole('button', { name: '50' }))

    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Switch plan' }) as HTMLButtonElement).disabled
      ).toBe(true)
    )
    expect(screen.getByRole('link', { name: 'billing page' }).getAttribute('href')).toBe('/billing')
  })
})
