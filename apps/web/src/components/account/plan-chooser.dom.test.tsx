// The billing page's plan card: checkout for a first plan, a confirmed switch for a live one.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refresh = vi.fn()
const assign = vi.fn()
const success = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() })
}))
vi.mock('sonner', () => ({ toast: { success, error: vi.fn() } }))

const { PlanChooser } = await import('./plan-chooser')

const fetchMock = vi.fn()
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const sent = (call: number) => ({
  path: fetchMock.mock.calls[call]?.[0],
  body: JSON.parse(String(fetchMock.mock.calls[call]?.[1]?.body))
})

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, assign }
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  fetchMock.mockReset()
  refresh.mockReset()
  assign.mockReset()
  success.mockReset()
})

const pick = (domains: number) =>
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${domains} sites`) }))
const card = (domains: number) =>
  screen.getByRole('radio', { name: new RegExp(`^${domains} sites`) }).closest('label')?.textContent
const period = (label: 'Monthly' | 'Yearly') =>
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}`) }))

describe('PlanChooser, no plan yet', () => {
  it('checks out the chosen size and period on Stripe', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { url: 'https://checkout.stripe.com/c/pay_1' }))
    render(
      <PlanChooser
        mode="checkout"
        current={null}
        initial={{ domains: 25, billing: 'monthly' }}
        claimed={0}
      />
    )
    period('Yearly')
    pick(50)
    expect(screen.getByText('$150')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Continue to checkout/ }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay_1'))
    expect(sent(0)).toEqual({
      path: '/api/stripe/checkout',
      body: { domains: 50, billing: 'annual' }
    })
  })

  it('starts on the plan Pricing linked to', () => {
    render(
      <PlanChooser
        mode="checkout"
        current={null}
        initial={{ domains: 100, billing: 'annual' }}
        claimed={0}
      />
    )
    expect(screen.getByRole('radio', { name: /^100 sites/ }).getAttribute('aria-checked')).toBe(
      'true'
    )
    expect(screen.getByRole('button', { name: /^Yearly/ }).getAttribute('aria-pressed')).toBe(
      'true'
    )
  })

  it("shows the server's refusal and lets the visitor try again", async () => {
    fetchMock.mockResolvedValueOnce(
      json(409, { error: 'You already have a plan.', code: 'has_plan' })
    )
    render(
      <PlanChooser
        mode="checkout"
        current={null}
        initial={{ domains: 25, billing: 'monthly' }}
        claimed={0}
      />
    )
    const button = screen.getByRole('button', { name: /Continue to checkout/ })
    fireEvent.click(button)
    expect(await screen.findByText('You already have a plan.')).toBeTruthy()
    expect(assign).not.toHaveBeenCalled()
    expect(button.hasAttribute('disabled')).toBe(false)
  })

  it('refreshes when a plan already exists, so the page offers the switch', async () => {
    fetchMock.mockResolvedValueOnce(
      json(409, { error: 'You already have a plan. Switch it here.', code: 'has_plan' })
    )
    render(
      <PlanChooser
        mode="checkout"
        current={null}
        initial={{ domains: 25, billing: 'monthly' }}
        claimed={0}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Continue to checkout/ }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('says when dr.serp.co is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    render(
      <PlanChooser
        mode="checkout"
        current={null}
        initial={{ domains: 25, billing: 'monthly' }}
        claimed={0}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Continue to checkout/ }))
    expect(await screen.findByText(/Couldn't reach dr.serp.co/)).toBeTruthy()
  })
})

describe('PlanChooser, a live plan', () => {
  const current = { domains: 25, billing: 'monthly' } as const

  it('marks the current plan and waits for a different one', () => {
    render(<PlanChooser mode="change" current={current} initial={current} claimed={3} />)
    expect(card(25)).toContain('Current')
    expect(
      screen.getByRole('button', { name: 'Pick a different plan' }).hasAttribute('disabled')
    ).toBe(true)
    period('Yearly')
    // The badge marks the plan, so the yearly 25 isn't "Current".
    expect(card(25)).not.toContain('Current')
    expect(
      screen.getByRole('button', { name: 'Switch to 25 sites' }).hasAttribute('disabled')
    ).toBe(false)
  })

  it('confirms an upgrade with what Stripe charges, then switches and refreshes', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }))
    render(<PlanChooser mode="change" current={current} initial={current} claimed={3} />)
    pick(50)
    fireEvent.click(screen.getByRole('button', { name: 'Switch to 50 sites' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Switch to 50 sites for $15 a month?')).toBeTruthy()
    expect(within(dialog).getByText(/charges the difference/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch plan' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(sent(0)).toEqual({
      path: '/api/stripe/change-plan',
      body: { domains: 50, billing: 'monthly' }
    })
    expect(success).toHaveBeenCalledWith('Switched to 50 sites, $15 a month.')
  })

  it('says a downgrade is credited to the next invoice', async () => {
    render(
      <PlanChooser
        mode="change"
        current={{ domains: 50, billing: 'monthly' }}
        initial={{ domains: 50, billing: 'monthly' }}
        claimed={3}
      />
    )
    pick(12)
    fireEvent.click(screen.getByRole('button', { name: 'Switch to 12 sites' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/credits the difference/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("won't move below the sites already claimed", () => {
    render(
      <PlanChooser
        mode="change"
        current={{ domains: 50, billing: 'monthly' }}
        initial={{ domains: 50, billing: 'monthly' }}
        claimed={30}
      />
    )
    pick(25)
    expect(
      screen.getByText(/You've claimed 30 sites. Release some under Sites before choosing 25/)
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Switch to 25 sites' }).hasAttribute('disabled')
    ).toBe(true)
  })

  it('says a switch between monthly and yearly restarts the billing period', async () => {
    render(<PlanChooser mode="change" current={current} initial={current} claimed={3} />)
    period('Yearly')
    pick(12)
    fireEvent.click(screen.getByRole('button', { name: 'Switch to 12 sites' }))
    const dialog = await screen.findByRole('alertdialog')
    // $40 a year from $7 a month: not a credit, whatever the per-period prices say.
    expect(
      within(dialog).getByText(/Your billing restarts today, yearly: Stripe charges \$40 now/)
    ).toBeTruthy()
  })

  it('waits for Stripe to confirm a switch before offering another', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }))
    const { rerender } = render(
      <PlanChooser mode="change" current={current} initial={current} claimed={3} />
    )
    pick(50)
    fireEvent.click(screen.getByRole('button', { name: 'Switch to 50 sites' }))
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Switch plan' })
    )
    expect(await screen.findByText(/Switching to 50 sites, \$15 a month/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Check again/ })).toBeTruthy()
    // The refresh still shows the old plan (the webhook hasn't landed): no second switch.
    expect(screen.getByRole('button', { name: 'Switch to 50 sites' })).toHaveProperty(
      'disabled',
      true
    )
    rerender(
      <PlanChooser
        mode="change"
        current={{ domains: 50, billing: 'monthly' }}
        initial={current}
        claimed={3}
      />
    )
    await waitFor(() => expect(screen.queryByText(/Switching to 50 sites/)).toBeNull())
    expect(screen.getByRole('button', { name: 'Pick a different plan' })).toBeTruthy()
  })

  it('allows the same size on another period, as the server does, even when over it', () => {
    render(
      <PlanChooser
        mode="change"
        current={{ domains: 25, billing: 'monthly' }}
        initial={{ domains: 25, billing: 'monthly' }}
        claimed={30}
      />
    )
    period('Yearly')
    expect(screen.queryByText(/Release some under Sites/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Switch to 25 sites' })).toHaveProperty(
      'disabled',
      false
    )
  })

  it('holds the switch while a payment is due', () => {
    render(
      <PlanChooser
        mode="change"
        current={current}
        initial={current}
        claimed={3}
        blocked="Your plan has an unpaid invoice. Update your card above, then switch."
      />
    )
    pick(50)
    expect(screen.getByText(/unpaid invoice/)).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Switch to 50 sites' }).hasAttribute('disabled')
    ).toBe(true)
  })

  it('shows a refused switch and leaves the plan as it was', async () => {
    fetchMock.mockResolvedValueOnce(
      json(402, { error: 'Your card was declined.', code: 'payment_failed' })
    )
    render(<PlanChooser mode="change" current={current} initial={current} claimed={3} />)
    pick(100)
    fireEvent.click(screen.getByRole('button', { name: 'Switch to 100 sites' }))
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Switch plan' })
    )
    expect(await screen.findByText('Your card was declined.')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(refresh).not.toHaveBeenCalled()
    expect(success).not.toHaveBeenCalled()
  })
})
