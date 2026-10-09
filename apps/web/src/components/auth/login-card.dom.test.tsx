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
    // No answer queued: the request fails like a dropped connection.
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    expect(await screen.findByText("Couldn't reach dr.serp.co")).toBeTruthy()
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
    expect(screen.getByRole('button', { name: 'Send a new code' })).toBeTruthy()
    expect(codeInput().disabled).toBe(true)
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
    fireEvent.click(resend())
    await waitFor(() => expect(calls.filter(call => call.path === SEND)).toHaveLength(2))
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
