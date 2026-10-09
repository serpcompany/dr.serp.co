// /login's states (#136, accounts-and-sign-in.md § The sign-in screen): each answer from the
// two auth endpoints becomes one message, pastes go through one parser, and a wrong guess is
// never sent twice.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginCard } from './login-card'

type Answer = { status: number; body?: unknown; headers?: Record<string, string> }

const calls: { path: string; body: Record<string, unknown> }[] = []
let answers: Record<string, Answer[]> = {}
const assign = vi.fn()

function answer(path: string, ...list: Answer[]) {
  answers[path] = [...(answers[path] ?? []), ...list]
}

beforeEach(() => {
  calls.length = 0
  answers = {}
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.replace('/api/auth', '')
      calls.push({ path, body: JSON.parse(String(init?.body ?? '{}')) })
      const next = answers[path]?.shift()
      if (!next) throw new TypeError('Failed to fetch')
      return new Response(next.body === undefined ? null : JSON.stringify(next.body), {
        status: next.status,
        headers: { 'content-type': 'application/json', ...next.headers }
      })
    })
  )
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, assign, origin: 'https://dr.serp.co' }
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  assign.mockReset()
  window.localStorage.clear()
})

const SEND = '/email-otp/send-verification-otp'
const SIGN_IN = '/sign-in/email-otp'

async function toCodeStep(email = 'owner@example.com') {
  answer(SEND, { status: 200, body: { success: true } })
  render(<LoginCard callbackPath="/billing" />)
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
  fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
  await screen.findByRole('heading', { name: 'Check your email' })
}

function codeInput() {
  return document.getElementById('otp-verification') as HTMLInputElement
}

function paste(text: string) {
  fireEvent.paste(codeInput(), { clipboardData: { getData: () => text } })
}

describe('the email step', () => {
  it('sends a sign-in code request and moves to the code', async () => {
    await toCodeStep()
    expect(calls).toEqual([{ path: SEND, body: { email: 'owner@example.com', type: 'sign-in' } }])
    expect(screen.getByText(/is a valid address, we sent it a 6-digit code/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Resend in\s*1:00/ })).toHaveProperty(
      'disabled',
      true
    )
  })

  it('explains an invalid email', async () => {
    answer(SEND, { status: 400, body: { code: 'INVALID_EMAIL' } })
    render(<LoginCard callbackPath="/add" />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'devin@serp' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    expect(await screen.findByText(/Enter a full email address/)).toBeTruthy()
  })

  it('shows the per-client wait and holds the button', async () => {
    answer(SEND, { status: 429, body: { code: 'RATE_LIMITED' }, headers: { 'retry-after': '42' } })
    render(<LoginCard callbackPath="/add" />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    expect(await screen.findByText('Too many requests')).toBeTruthy()
    // The clock ticks once a second, so the wait reads 42 or 43 seconds.
    expect(screen.getByText(/Try again in 4[23] seconds/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Send code \(\s*0:4[23]\s*\)/ })).toHaveProperty(
      'disabled',
      true
    )
  })

  it('says when codes are unavailable, and when the site cannot be reached', async () => {
    answer(SEND, { status: 503, body: { code: 'OTP_DELIVERY_UNAVAILABLE' } })
    render(<LoginCard callbackPath="/add" />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    expect(await screen.findByText('Sign-in codes are unavailable right now')).toBeTruthy()
    expect(screen.getByText('Nothing was sent. Try again in a few minutes.')).toBeTruthy()
    // No answer queued: the request fails like a dropped connection.
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    expect(await screen.findByText("Couldn't reach dr.serp.co")).toBeTruthy()
    expect(screen.getByText('Check your connection and try again.')).toBeTruthy()
  })
})

describe('the code step', () => {
  it('signs in once with a pasted "482 913", then goes back where it came from', async () => {
    await toCodeStep()
    answer(SIGN_IN, { status: 200, body: { user: { email: 'owner@example.com' } } })
    paste('482 913')
    expect(await screen.findByRole('heading', { name: "You're signed in" })).toBeTruthy()
    expect(calls.filter(call => call.path === SIGN_IN)).toEqual([
      { path: SIGN_IN, body: { email: 'owner@example.com', otp: '482913' } }
    ])
    expect(window.localStorage.getItem('dr-auth-email')).toBe('owner@example.com')
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/billing'), { timeout: 2000 })
  })

  it('finds the one code in pasted text, and ignores ambiguous text', async () => {
    await toCodeStep()
    paste('Old code 111 111, new code 719208')
    paste('7192081')
    expect(calls.filter(call => call.path === SIGN_IN)).toHaveLength(0)
    expect(codeInput().value).toBe('')
    answer(SIGN_IN, { status: 400, body: { code: 'INVALID_OTP' } })
    paste('It expires in 10 minutes. Code: 719208')
    await screen.findByText(/That code isn't right/)
    expect(calls.filter(call => call.path === SIGN_IN)[0]?.body.otp).toBe('719208')
  })

  it('counts down the tries, never resends a rejected code, and offers a new code at the end', async () => {
    await toCodeStep()
    answer(
      SIGN_IN,
      { status: 400, body: { code: 'INVALID_OTP' } },
      { status: 400, body: { code: 'INVALID_OTP' } },
      { status: 400, body: { code: 'INVALID_OTP' } }
    )
    paste('111111')
    expect(await screen.findByText("That code isn't right. 2 tries left.")).toBeTruthy()
    paste('111111')
    expect(calls.filter(call => call.path === SIGN_IN)).toHaveLength(1)
    paste('222222')
    expect(await screen.findByText("That code isn't right. 1 try left.")).toBeTruthy()
    paste('333333')
    expect(await screen.findByText('Too many wrong tries. Send a new code.')).toBeTruthy()
    // As in the mockup: Sign in stays (disabled), and Resend in the label row takes over.
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveProperty('disabled', true)
    const resend = screen.getByRole('button', { name: /Resend code/ })
    expect(resend).toHaveProperty('disabled', false)
    expect(codeInput().disabled).toBe(true)
    await waitFor(() => expect(document.activeElement).toBe(resend))
  })

  it('says when the code expired', async () => {
    await toCodeStep()
    answer(SIGN_IN, { status: 400, body: { code: 'OTP_EXPIRED' } })
    paste('482913')
    expect(await screen.findByText(/That code expired/)).toBeTruthy()
  })

  it('enables Resend after a minute, and sends a new code', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await toCodeStep()
    const resend = () => screen.getByRole('button', { name: /Resend/ })
    expect(resend()).toHaveProperty('disabled', true)
    await act(async () => {
      vi.advanceTimersByTime(61_000)
    })
    expect(resend().textContent).toContain('Resend code')
    expect(resend()).toHaveProperty('disabled', false)
    answer(SEND, { status: 200, body: { success: true } })
    resend().focus()
    fireEvent.click(resend())
    await waitFor(() => expect(calls.filter(call => call.path === SEND)).toHaveLength(2))
    // Focus goes back to the slots for the new code.
    await waitFor(() => expect(document.activeElement).toBe(codeInput()))
  })

  it('goes back to the email step on request', async () => {
    await toCodeStep()
    fireEvent.click(screen.getByRole('button', { name: 'Wrong address? Use a different email.' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
  })
})

describe('signed in already', () => {
  it('opens on the signed-in screen', () => {
    render(<LoginCard callbackPath="/add" signedInEmail="owner@example.com" />)
    expect(screen.getByRole('heading', { name: "You're signed in" })).toBeTruthy()
    expect(screen.getByText('owner@example.com')).toBeTruthy()
    expect(screen.getByText('Continue to your sites')).toBeTruthy()
  })
})

describe('failures on the code step', () => {
  it('waits out the per-client guess limit', async () => {
    await toCodeStep()
    answer(SIGN_IN, {
      status: 429,
      body: { code: 'RATE_LIMITED' },
      headers: { 'retry-after': '42' }
    })
    paste('482913')
    expect(
      await screen.findByText(/Too many tries from this network. Try again in 4[23] seconds/)
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Sign in/ })).toHaveProperty('disabled', true)
  })

  it('shows a lost connection as a notice and leaves the slots as they were', async () => {
    await toCodeStep()
    // No answer queued: the request fails like a dropped connection.
    paste('482913')
    expect(await screen.findByText("Couldn't reach dr.serp.co")).toBeTruthy()
    expect(screen.getByText('Check your connection, then try the code again.')).toBeTruthy()
    expect(document.querySelector('[data-slot=input-otp-slot][aria-invalid=true]')).toBeNull()
    // Focus is back in the slots, the digits selected for the next try.
    await waitFor(() => expect(document.activeElement).toBe(codeInput()))
    expect(codeInput().selectionStart).toBe(0)
    expect(codeInput().selectionEnd).toBe(6)
    // The next guess that gets through clears the notice.
    answer(SIGN_IN, { status: 400, body: { code: 'INVALID_OTP' } })
    paste('111111')
    await screen.findByText(/That code isn't right/)
    expect(screen.queryByText("Couldn't reach dr.serp.co")).toBeNull()
  })

  it('tells a server failure from a lost connection', async () => {
    await toCodeStep()
    answer(SIGN_IN, { status: 503, body: { code: 'RATE_LIMITER_UNAVAILABLE' } })
    paste('482913')
    expect(await screen.findByText('Sign-in is unavailable right now')).toBeTruthy()
    expect(
      screen.getByText("Your code wasn't checked. Try it again in a few minutes.")
    ).toBeTruthy()
    expect(screen.queryByText("Couldn't reach dr.serp.co")).toBeNull()
    // The slots start focused, so the selection is what shows focus came back after the check.
    await waitFor(() => expect(codeInput().selectionEnd).toBe(6))
    expect(codeInput().selectionStart).toBe(0)
    expect(document.activeElement).toBe(codeInput())
  })

  it('reports a refused resend', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await toCodeStep()
    await act(async () => {
      vi.advanceTimersByTime(61_000)
    })
    answer(SEND, { status: 429, body: { code: 'RATE_LIMITED' }, headers: { 'retry-after': '30' } })
    fireEvent.click(screen.getByRole('button', { name: /Resend code/ }))
    expect(await screen.findByText('Too many requests')).toBeTruthy()
    // Checking a code meanwhile keeps the wait: Resend stays off until it runs out.
    answer(SIGN_IN, { status: 400, body: { code: 'INVALID_OTP' } })
    paste('111111')
    await screen.findByText(/That code isn't right/)
    expect(screen.getByText('Too many requests')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Resend code/ })).toHaveProperty('disabled', true)
    answer(SEND, { status: 503, body: { code: 'OTP_DELIVERY_UNAVAILABLE' } })
    await act(async () => {
      vi.advanceTimersByTime(31_000)
    })
    fireEvent.click(screen.getByRole('button', { name: /Resend code/ }))
    expect(await screen.findByText('Sign-in codes are unavailable right now')).toBeTruthy()
  })

  it('treats a code older than 10 minutes as expired', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await toCodeStep()
    await act(async () => {
      vi.advanceTimersByTime(10 * 60_000 + 1000)
    })
    answer(SIGN_IN, { status: 400, body: { code: 'INVALID_OTP' } })
    paste('482913')
    expect(await screen.findByText(/That code expired/)).toBeTruthy()
  })
})

describe('after a resend that may not have sent a new code', () => {
  it('stops counting, and ends the code after three misses since the resend', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await toCodeStep()
    answer(SIGN_IN, { status: 400, body: { code: 'INVALID_OTP' } })
    paste('111111')
    expect(await screen.findByText("That code isn't right. 2 tries left.")).toBeTruthy()
    await act(async () => {
      vi.advanceTimersByTime(61_000)
    })
    answer(SEND, { status: 200, body: { success: true } })
    fireEvent.click(screen.getByRole('button', { name: /Resend code/ }))
    await waitFor(() => expect(calls.filter(call => call.path === SEND)).toHaveLength(2))
    // The resend has finished (its wait starts again) before the next guesses go in; a paste
    // while it is still in flight would race the cleared slots.
    expect(await screen.findByRole('button', { name: /Resend in/ })).toBeTruthy()
    answer(
      SIGN_IN,
      { status: 400, body: { code: 'INVALID_OTP' } },
      { status: 400, body: { code: 'INVALID_OTP' } },
      { status: 400, body: { code: 'INVALID_OTP' } }
    )
    paste('222222')
    expect(
      await screen.findByText("That code isn't right. Check the most recent email and try again.")
    ).toBeTruthy()
    paste('333333')
    await waitFor(() => expect(calls.filter(call => call.path === SIGN_IN)).toHaveLength(3))
    paste('444444')
    expect(await screen.findByText('Too many wrong tries. Send a new code.')).toBeTruthy()
  })
})

describe('typed and autofilled codes', () => {
  it('reads an autofilled spaced code whole', async () => {
    await toCodeStep()
    answer(SIGN_IN, { status: 200, body: { user: { email: 'owner@example.com' } } })
    fireEvent.input(codeInput(), { target: { value: '482 913' } })
    expect(await screen.findByRole('heading', { name: "You're signed in" })).toBeTruthy()
    expect(calls.find(call => call.path === SIGN_IN)?.body.otp).toBe('482913')
  })

  it('reads text inserted in one go like a paste', async () => {
    await toCodeStep()
    answer(SIGN_IN, { status: 200, body: { user: { email: 'owner@example.com' } } })
    const event = new InputEvent('beforeinput', {
      data: 'Code: 482-913',
      inputType: 'insertReplacementText',
      cancelable: true,
      bubbles: true
    })
    act(() => {
      codeInput().dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(true)
    expect(await screen.findByRole('heading', { name: "You're signed in" })).toBeTruthy()
    expect(calls.find(call => call.path === SIGN_IN)?.body.otp).toBe('482913')
  })
})

describe('signing out from the signed-in screen', () => {
  it('goes to /login, and the pending redirect never fires', async () => {
    answer('/sign-out', { status: 200, body: { success: true } })
    render(<LoginCard callbackPath="/billing" signedInEmail="owner@example.com" />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login?callbackUrl=%2Fbilling'))
    await new Promise(resolve => setTimeout(resolve, 1400))
    expect(assign).not.toHaveBeenCalledWith('/billing')
  })
})
