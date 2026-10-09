// The billing page in each plan state: what it says, which Stripe buttons it offers, and whether
// it checks out a new plan or switches the live one.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Account, AccountPlan } from '@/lib/account'

const cardOf = vi.fn()
vi.mock('server-only', () => ({}))
vi.mock('@/server/billing', () => ({ cardOf }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() })
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { FreeBilling, PlanBilling } = await import('./billing-states')

afterEach(() => {
  cleanup()
  cardOf.mockReset()
})

const PLAN: AccountPlan = {
  kind: 'active',
  paid: true,
  live: true,
  portal: true,
  domains: 12,
  interval: 'monthly',
  price: 4,
  periodEnd: '2027-01-01T00:00:00.000Z'
}

function account(plan: Partial<AccountPlan>, sites = 5): Account {
  return {
    email: 'owner@example.com',
    plan: { ...PLAN, ...plan },
    canClaim: true,
    sites: Array.from({ length: sites }, (_, index) => ({
      domain: `site-${index}.example`,
      title: null,
      dr: 40,
      change: null,
      checkedAt: null,
      history: []
    })),
    average: [],
    trend: null,
    omitted: 0
  }
}

async function renderPlan(plan: Partial<AccountPlan>, checkout?: string) {
  render(await PlanBilling({ account: account(plan), asked: null, checkout }))
}

const button = (name: RegExp | string) => screen.queryByRole('button', { name })

describe('a live plan', () => {
  it('shows the plan, its card and renewal, and switches it', async () => {
    cardOf.mockResolvedValue('Visa ending 4242')
    await renderPlan({})
    // The plan card's title (the picker below has a "12 sites" card too).
    expect(document.querySelector('[data-slot=card-title]')?.textContent).toBe('12 sites')
    expect(screen.getByText('Active')).toBeTruthy()
    expect(screen.getByText('$4 a month')).toBeTruthy()
    expect(screen.getByText('Jan 1, 2027')).toBeTruthy()
    expect(screen.getByText('Visa ending 4242')).toBeTruthy()
    expect(screen.getByText('5 of 12')).toBeTruthy()
    expect(button(/Manage in Stripe/)).toBeTruthy()
    expect(screen.getByText('Change plan')).toBeTruthy()
    expect(button(/Continue to checkout/)).toBeNull()
  })

  it('confirms a return from checkout', async () => {
    await renderPlan({}, 'success')
    expect(screen.getByText("You're subscribed")).toBeTruthy()
  })
})

describe('a past-due plan', () => {
  it('says so, offers the card update, and holds the switch', async () => {
    // In its paid period (the entitlement's grace) the plan still works, but a payment failed.
    await renderPlan({ kind: 'past-due' })
    expect(screen.getByText('Past due')).toBeTruthy()
    expect(screen.getByText('Your last payment failed')).toBeTruthy()
    expect(button(/Update card/)).toBeTruthy()
    expect(screen.getByText(/unpaid invoice/)).toBeTruthy()
    expect(button('Pick a different plan')).toHaveProperty('disabled', true)
  })
})

describe('an ending plan', () => {
  it('says what changes when it ends, and keeps the plan through the portal', async () => {
    await renderPlan({ kind: 'ending' })
    expect(screen.getByText('Your plan ends on Jan 1, 2027')).toBeTruthy()
    expect(screen.getByText(/your 5 sites stay claimed, but their links go nofollow/)).toBeTruthy()
    expect(button(/Keep my plan/)).toBeTruthy()
    expect(screen.getByText('Change plan')).toBeTruthy()
  })

  it('offers a new plan once canceled, since nothing is left to switch', async () => {
    await renderPlan({ kind: 'ending', live: false })
    expect(button(/Keep my plan/)).toBeNull()
    expect(screen.queryByText('Change plan')).toBeNull()
    expect(button(/Continue to checkout/)).toBeTruthy()
    expect(cardOf).not.toHaveBeenCalled()
  })
})

describe('an internal account', () => {
  it('shows no price, no Stripe and no plan change', async () => {
    await renderPlan({ domains: null, interval: null, price: null, live: false, portal: false })
    expect(document.querySelector('[data-slot=card-title]')?.textContent).toBe('Unlimited')
    expect(screen.getByText('No charge')).toBeTruthy()
    expect(button(/Manage in Stripe/)).toBeNull()
    expect(screen.queryByText('Change plan')).toBeNull()
    expect(button(/Continue to checkout/)).toBeNull()
    expect(cardOf).not.toHaveBeenCalled()
  })
})

describe('no plan', () => {
  const free = (portal: boolean) =>
    account({ kind: 'free', paid: false, live: false, portal, domains: null, interval: null })

  it('checks out the plan Pricing linked with', () => {
    render(
      <FreeBilling
        account={free(false)}
        asked={{ domains: 50, billing: 'annual' }}
        checkout={undefined}
      />
    )
    expect(screen.getByText('Choose a plan')).toBeTruthy()
    expect(screen.getByRole('radio', { name: /^50 sites/ }).getAttribute('aria-checked')).toBe(
      'true'
    )
    expect(screen.queryByText('Past invoices')).toBeNull()
  })

  it('opens past invoices for a lapsed subscriber', () => {
    render(<FreeBilling account={free(true)} asked={null} checkout={undefined} />)
    expect(screen.getByText('Past invoices')).toBeTruthy()
  })

  it('holds checkout while a payment awaits the webhook', () => {
    render(<FreeBilling account={free(false)} asked={null} checkout="success" />)
    expect(screen.getByText('Payment received')).toBeTruthy()
    expect(button(/Check again/)).toBeTruthy()
    // A second checkout now would start a second subscription.
    expect(button(/Continue to checkout/)).toBeNull()
  })

  it('says a cancelled checkout charged nothing', () => {
    render(<FreeBilling account={free(false)} asked={null} checkout="cancelled" />)
    expect(screen.getByText('Checkout cancelled')).toBeTruthy()
    expect(button(/Continue to checkout/)).toBeTruthy()
  })
})
