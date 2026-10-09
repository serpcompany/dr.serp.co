'use client'

import { ArrowRightIcon, CircleXIcon, ClockIcon, RefreshCwIcon, WifiOffIcon } from 'lucide-react'
import Link from 'next/link'
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@/components/ui/input-otp'
import { Spinner } from '@/components/ui/spinner'
import { Wordmark } from '@/components/wordmark'
import { callbackDestination, loginHref } from '@/lib/auth/callback-url'
import { cn } from '@/lib/utils'
import {
  CODE_ATTEMPTS,
  CODE_LENGTH,
  CODE_LIFETIME_MINUTES,
  CODE_LIFETIME_SECONDS,
  codeDigits,
  DISPLAY_EMAIL_KEY,
  formatCountdown,
  formatWait,
  RESEND_COOLDOWN_SECONDS,
  readCodeText,
  requestCode,
  signOut,
  verifyCode
} from './sign-in-api'

/**
 * `/login`, built to the approved mockups (#140): shadcn's login-03 page with its email form,
 * then the code step as shadcn's InputOTP "Form" example (the card, the label row with Resend,
 * the large 3 + 3 slots, the error and the footer button), then a short signed-in screen that
 * returns to `callbackPath`. The logic is best.serp.co's: one paste parser, the attempt count,
 * and the resend countdown (accounts-and-sign-in.md § The sign-in screen).
 */

const REDIRECT_DELAY_MS = 1200
const DIGITS_ONLY = '^\\d+$'
/** The example's slot size for base-nova (style-nova: h-12 w-11 text-xl). */
const SLOTS =
  '*:data-[slot=input-otp-slot]:h-12 *:data-[slot=input-otp-slot]:w-11 *:data-[slot=input-otp-slot]:text-xl'

/**
 * A message above the form: a wait, the server down, no connection, or something unexpected.
 * `action` says whether a code was being sent or checked, which the message names.
 */
type Notice =
  | { kind: 'limited'; until: number }
  | { kind: 'unavailable' | 'offline'; action: 'send' | 'verify' }
  | { kind: 'failed' }
  | null

type CodeError =
  /** `attemptsLeft` is null when a resend may have replaced the code, so the count is unknown. */
  | { kind: 'wrong'; attemptsLeft: number | null }
  | { kind: 'expired' }
  | { kind: 'attempts' }
  | { kind: 'limited'; until: number }
  | null

/**
 * The code step. `wrongGuesses` counts misses against the code the browser surely holds. After a
 * resend that may or may not have sent a new code (a per-email limit answers like a sent one),
 * `uncertain` is set, and only the server's TOO_MANY_ATTEMPTS ends the code.
 */
type Step =
  | { kind: 'email' }
  | {
      kind: 'code'
      sentAt: number
      uncertain: boolean
      wrongGuesses: number
      guessesSinceResend: number
    }
  | { kind: 'done'; email: string }

function freshCode(): Step {
  return {
    kind: 'code',
    sentAt: Date.now(),
    uncertain: false,
    wrongGuesses: 0,
    guessesSinceResend: 0
  }
}

export type LoginCardProps = {
  callbackPath: string
  /** Set when the visitor is already signed in: the card opens on the signed-in screen. */
  signedInEmail?: string | null
}

export function LoginCard({ callbackPath, signedInEmail }: LoginCardProps) {
  const [step, setStep] = useState<Step>(
    signedInEmail ? { kind: 'done', email: signedInEmail } : { kind: 'email' }
  )
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [otp, setOtp] = useState('')
  const [codeError, setCodeError] = useState<CodeError>(null)
  const [pending, setPending] = useState(false)
  /** The last code the server rejected; it is never sent again. */
  const [rejectedCode, setRejectedCode] = useState<string | null>(null)
  const codeInput = useRef<HTMLInputElement>(null)
  const resendButton = useRef<HTMLButtonElement>(null)
  /** Set by "Not you? Sign out", so the redirect to the callback doesn't race it. */
  const leaving = useRef(false)
  /** Set synchronously, so a paste and a keystroke in the same tick cannot both submit. */
  const verifying = useRef(false)
  /**
   * Set while `onInput` has already read the field's whole value, so input-otp's change for the
   * same event (which keeps the first six digits of anything) is dropped.
   */
  const inputRead = useRef(false)
  const now = useNow(step.kind !== 'done')
  const destination = callbackDestination(callbackPath)

  useEffect(() => {
    if (step.kind !== 'done') return undefined
    // A full page load, so the header and every component that reads the account start over.
    const timer = window.setTimeout(() => {
      if (!leaving.current) window.location.assign(callbackPath)
    }, REDIRECT_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [step, callbackPath])

  // A spent code disables the slots, so focus moves to Resend rather than the page body.
  const spent = codeError?.kind === 'expired' || codeError?.kind === 'attempts'
  useEffect(() => {
    if (spent) resendButton.current?.focus()
  }, [spent])

  // After a check that didn't sign in, or a resend, focus goes back to the slots with the digits
  // selected, so the next code typed replaces them. (Not when a spent code disabled them.)
  const [focusSlots, setFocusSlots] = useState(0)
  useEffect(() => {
    const input = codeInput.current
    if (!focusSlots || !input || input.disabled) return
    input.focus()
    input.setSelectionRange(0, input.value.length)
  }, [focusSlots])

  async function sendCode(address: string): Promise<boolean> {
    const outcome = await requestCode(address)
    switch (outcome.kind) {
      case 'sent':
        return true
      case 'invalid-email':
        setEmailError('Enter a full email address, like you@example.com.')
        setStep({ kind: 'email' })
        return false
      case 'limited':
        setNotice({ kind: 'limited', until: Date.now() + outcome.retryAfterSeconds * 1000 })
        return false
      case 'unavailable':
      case 'offline':
        setNotice({ kind: outcome.kind, action: 'send' })
        return false
      case 'failed':
        setNotice({ kind: 'failed' })
        return false
    }
  }

  async function onEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const address = email.trim()
    if (!address) {
      setEmailError('Enter your email address.')
      return
    }
    setPending(true)
    setEmailError(null)
    setNotice(null)
    const sent = await sendCode(address)
    setPending(false)
    if (!sent) return
    setEmail(address)
    setOtp('')
    setRejectedCode(null)
    setCodeError(null)
    setStep(freshCode())
  }

  async function onResend() {
    setPending(true)
    setNotice(null)
    const sent = await sendCode(email)
    setPending(false)
    if (!sent) return
    setFocusSlots(count => count + 1)
    setOtp('')
    setRejectedCode(null)
    setCodeError(null)
    const codeDead = codeError?.kind === 'expired' || codeError?.kind === 'attempts'
    if (step.kind !== 'code' || codeDead) {
      setStep(freshCode())
      return
    }
    // A per-email limit answers like a sent code, so the inbox may hold the old code or a new
    // one: keep the old code's misses, count the new code's separately, and let the server
    // decide when the code is spent.
    setStep({
      kind: 'code',
      sentAt: Date.now(),
      uncertain: true,
      wrongGuesses: step.wrongGuesses,
      guessesSinceResend: 0
    })
  }

  /** Every change to the code field ends here, already reduced to at most six digits. */
  function onCodeChange(value: string) {
    setOtp(value)
    if (value !== rejectedCode && codeError?.kind === 'wrong') setCodeError(null)
    // A full code that differs from the rejected one is sent at once, whether it was typed,
    // pasted or autofilled.
    if (value.length === CODE_LENGTH && value !== rejectedCode) void onVerify(value)
  }

  /**
   * Pasted or inserted text: one standalone code ("Code: 719208", "482 913") replaces whatever
   * the slots hold and is sent at once; a fragment (" 482 ") goes in at the caret; anything
   * ambiguous (two codes, seven digits) changes nothing and sends nothing.
   */
  function onCodeText(text: string, input: HTMLInputElement) {
    const read = readCodeText(text)
    if (read.kind === 'code') {
      onCodeChange(read.code)
      return
    }
    if (read.kind === 'ignore' || !read.digits) return
    const start = input.selectionStart ?? otp.length
    const end = input.selectionEnd ?? start
    onCodeChange((otp.slice(0, start) + read.digits + otp.slice(end)).slice(0, CODE_LENGTH))
  }

  // Text typed or inserted in one go (a keyboard's clipboard suggestion, drag and drop) is read
  // like a paste; a single typed character stays with input-otp. Native `beforeinput`: React's
  // `onBeforeInput` is not that event and cannot be cancelled.
  useEffect(() => {
    const input = codeInput.current
    if (!input) return undefined
    function onBeforeInput(event: InputEvent) {
      if (!input || !event.cancelable || event.inputType === 'insertFromPaste') return
      const text = event.data ?? event.dataTransfer?.getData('text/plain') ?? ''
      if (!text || (text.length === 1 && codeDigits(text) === text)) return
      event.preventDefault()
      onCodeText(text, input)
    }
    input.addEventListener('beforeinput', onBeforeInput)
    return () => input.removeEventListener('beforeinput', onBeforeInput)
  })

  async function onVerify(code: string) {
    if (step.kind !== 'code' || verifying.current || code.length !== CODE_LENGTH) return
    if (code === rejectedCode) return
    verifying.current = true
    setPending(true)
    setCodeError(null)
    // A wait from a refused resend stays until it runs out; Resend stays off until then.
    setNotice(current => (current?.kind === 'limited' ? current : null))
    const outcome = await verifyCode(email, code)
    verifying.current = false
    setPending(false)
    if (outcome.kind === 'signed-in') {
      try {
        window.localStorage.setItem(DISPLAY_EMAIL_KEY, outcome.email)
      } catch {
        // Only the display email; the session cookie is set either way.
      }
      setStep({ kind: 'done', email: outcome.email })
      return
    }
    setFocusSlots(count => count + 1)
    // A server or connection failure is a notice above the slots, which stay as they were.
    if (outcome.kind === 'offline' || outcome.kind === 'unavailable') {
      setNotice({ kind: outcome.kind, action: 'verify' })
      return
    }
    if (outcome.kind === 'failed') {
      setNotice({ kind: 'failed' })
      return
    }
    if (outcome.kind === 'wrong') {
      setRejectedCode(code)
      const wrongGuesses = step.wrongGuesses + 1
      const guessesSinceResend = step.guessesSinceResend + 1
      setStep({ ...step, wrongGuesses, guessesSinceResend })
      if (Date.now() - step.sentAt >= CODE_LIFETIME_SECONDS * 1000) {
        setCodeError({ kind: 'expired' })
      } else if (!step.uncertain) {
        setCodeError(
          wrongGuesses >= CODE_ATTEMPTS
            ? { kind: 'attempts' }
            : { kind: 'wrong', attemptsLeft: CODE_ATTEMPTS - wrongGuesses }
        )
      } else if (guessesSinceResend >= CODE_ATTEMPTS) {
        setCodeError({ kind: 'attempts' })
      } else {
        setCodeError({ kind: 'wrong', attemptsLeft: null })
      }
      return
    }
    if (outcome.kind === 'limited') {
      setCodeError({ kind: 'limited', until: Date.now() + outcome.retryAfterSeconds * 1000 })
      return
    }
    setCodeError({ kind: outcome.kind })
  }

  async function onSignOut() {
    leaving.current = true
    setPending(true)
    await signOut()
    window.location.assign(loginHref(callbackPath))
  }

  const limitedSeconds = notice?.kind === 'limited' ? (notice.until - now) / 1000 : 0
  const limitActive = notice?.kind === 'limited' && limitedSeconds > 0

  if (step.kind === 'done') {
    return (
      <LoginLayout>
        <Card>
          <CardHeader className="text-center">
            <CardTitle role="heading" aria-level={1} className="text-xl">
              You're signed in
            </CardTitle>
            <CardDescription>
              Signed in as <span className="font-medium text-foreground">{step.email}</span>.{' '}
              {destination.sentence}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Spinner />
                Redirecting…
              </div>
              <Field>
                <Link href={callbackPath} className={cn(buttonVariants())}>
                  {destination.button}
                  <ArrowRightIcon data-icon="inline-end" />
                </Link>
                <FieldDescription className="text-center">
                  Not you?{' '}
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0"
                    disabled={pending}
                    onClick={onSignOut}
                  >
                    Sign out
                  </Button>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      </LoginLayout>
    )
  }

  if (step.kind === 'code') {
    // `now` ticks once a second and can trail `sentAt`; clamp so the countdown starts at 1:00.
    const resendIn = Math.min(
      RESEND_COOLDOWN_SECONDS,
      RESEND_COOLDOWN_SECONDS - Math.max(0, now - step.sentAt) / 1000
    )
    const codeDead = codeError?.kind === 'expired' || codeError?.kind === 'attempts'
    const guessLimitSeconds = codeError?.kind === 'limited' ? (codeError.until - now) / 1000 : 0
    const message = codeErrorMessage(codeError, guessLimitSeconds)
    const invalid = message ? true : undefined
    const canResend = (resendIn <= 0 || codeDead) && !pending && !limitActive
    return (
      <LoginLayout wide>
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={1}>
              Check your email
            </CardTitle>
            <CardDescription>
              If <span className="font-medium">{email}</span> is a valid address, we sent it a{' '}
              {CODE_LENGTH}-digit code. It works for {CODE_LIFETIME_MINUTES} minutes, in this
              browser.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              id="code-form"
              onSubmit={event => {
                event.preventDefault()
                void onVerify(otp)
              }}
              className="flex flex-col gap-4"
            >
              <LoginNotice notice={notice} seconds={limitedSeconds} />
              <Field data-invalid={invalid}>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="otp-verification">Verification code</FieldLabel>
                  <Button
                    ref={resendButton}
                    variant="outline"
                    size="xs"
                    type="button"
                    disabled={!canResend}
                    onClick={onResend}
                  >
                    <RefreshCwIcon data-icon="inline-start" />
                    {resendIn > 0 && !codeDead ? (
                      <>
                        Resend in <span className="tabular-nums">{formatCountdown(resendIn)}</span>
                      </>
                    ) : (
                      'Resend code'
                    )}
                  </Button>
                </div>
                <InputOTP
                  ref={codeInput}
                  id="otp-verification"
                  autoFocus
                  autoComplete="one-time-code"
                  // input-otp otherwise widens its hidden input past the slots for a password
                  // manager's badge, and selecting the code then scrolls the card sideways.
                  pushPasswordManagerStrategy="none"
                  disabled={pending || codeDead}
                  inputMode="numeric"
                  maxLength={CODE_LENGTH}
                  aria-invalid={invalid}
                  aria-describedby={message ? 'otp-error' : 'otp-description'}
                  pattern={DIGITS_ONLY}
                  // Never reached while onPasteCapture reads every paste; if it were, it keeps
                  // only a fragment's digits, never the first six digits of a sentence.
                  pasteTransformer={text => {
                    const read = readCodeText(text)
                    return read.kind === 'digits' ? read.digits : ''
                  }}
                  value={otp}
                  onChange={value => {
                    if (!inputRead.current) onCodeChange(value)
                  }}
                  onPasteCapture={event => {
                    // Every paste is read here, before input-otp's own paste handling.
                    event.preventDefault()
                    event.stopPropagation()
                    onCodeText(event.clipboardData.getData('text/plain'), event.currentTarget)
                  }}
                  onInput={event => {
                    // Autofill and password managers set the whole value at once, past the
                    // digits-only pattern and the six-character limit: read it like pasted text.
                    const value = event.currentTarget.value
                    if (codeDigits(value) === value && value.length <= CODE_LENGTH) return
                    inputRead.current = true
                    queueMicrotask(() => {
                      inputRead.current = false
                    })
                    const read = readCodeText(value)
                    if (read.kind === 'code') onCodeChange(read.code)
                    else if (read.kind === 'digits') onCodeChange(read.digits)
                  }}
                >
                  <InputOTPGroup className={SLOTS}>
                    {[0, 1, 2].map(index => (
                      <InputOTPSlot key={index} index={index} aria-invalid={invalid} />
                    ))}
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup className={SLOTS}>
                    {[3, 4, 5].map(index => (
                      <InputOTPSlot key={index} index={index} aria-invalid={invalid} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                {message ? <FieldError id="otp-error">{message}</FieldError> : null}
                <FieldDescription id="otp-description">
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-muted-foreground"
                    disabled={pending}
                    onClick={() => {
                      setNotice(null)
                      setCodeError(null)
                      setStep({ kind: 'email' })
                    }}
                  >
                    Wrong address? Use a different email.
                  </Button>
                </FieldDescription>
              </Field>
            </form>
          </CardContent>
          <CardFooter className="flex-col gap-2">
            <Button
              type="submit"
              form="code-form"
              className="w-full"
              disabled={
                pending ||
                codeDead ||
                otp.length !== CODE_LENGTH ||
                otp === rejectedCode ||
                guessLimitSeconds > 0
              }
            >
              {pending ? <Spinner data-icon="inline-start" /> : null}
              Sign in
            </Button>
            <div className="text-sm text-muted-foreground">
              No email? Check your spam folder, or resend the code.
            </div>
          </CardFooter>
        </Card>
      </LoginLayout>
    )
  }

  return (
    <LoginLayout>
      <Card>
        <CardHeader className="text-center">
          <CardTitle role="heading" aria-level={1} className="text-xl">
            Sign in
          </CardTitle>
          <CardDescription>We'll email you a {CODE_LENGTH}-digit code.</CardDescription>
        </CardHeader>
        <CardContent>
          <form noValidate onSubmit={onEmailSubmit}>
            <FieldGroup>
              <LoginNotice notice={notice} seconds={limitedSeconds} />
              <Field data-invalid={emailError ? true : undefined}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  placeholder="you@example.com"
                  required
                  value={email}
                  aria-invalid={emailError ? true : undefined}
                  aria-describedby={emailError ? 'email-error' : undefined}
                  onChange={event => {
                    setEmail(event.target.value)
                    setEmailError(null)
                  }}
                />
                {emailError ? <FieldError id="email-error">{emailError}</FieldError> : null}
              </Field>
              <Field>
                <Button type="submit" disabled={pending || limitActive}>
                  {pending ? <Spinner data-icon="inline-start" /> : null}
                  {limitActive ? (
                    <>
                      Send code (
                      <span className="tabular-nums">{formatCountdown(limitedSeconds)}</span>)
                    </>
                  ) : (
                    'Send code'
                  )}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </LoginLayout>
  )
}

/** login-03's page: a muted background, the wordmark, the card and a line under it. */
function LoginLayout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div
        className={
          wide ? 'flex w-full max-w-md flex-col gap-6' : 'flex w-full max-w-sm flex-col gap-6'
        }
      >
        <Link href="/" className="flex items-center gap-2 self-center font-medium">
          <Wordmark />
          <span className="sr-only"> home</span>
        </Link>
        {children}
        <FieldDescription className="px-6 text-center">
          No password. Your first sign-in creates your account.
        </FieldDescription>
      </div>
    </div>
  )
}

function LoginNotice({ notice, seconds }: { notice: Notice; seconds: number }) {
  if (notice?.kind === 'limited' && seconds > 0) {
    return (
      <Alert variant="destructive">
        <ClockIcon />
        <AlertTitle>Too many requests</AlertTitle>
        <AlertDescription>
          Try again in {formatWait(seconds)}, or use the most recent code we sent.
        </AlertDescription>
      </Alert>
    )
  }
  // The mockup's wording (#140) for a code not sent and for a code not checked offline; the other
  // two name what didn't happen the same way.
  if (notice?.kind === 'unavailable') {
    return (
      <Alert variant="destructive">
        <CircleXIcon />
        <AlertTitle>
          {notice.action === 'send'
            ? 'Sign-in codes are unavailable right now'
            : 'Sign-in is unavailable right now'}
        </AlertTitle>
        <AlertDescription>
          {notice.action === 'send'
            ? 'Nothing was sent. Try again in a few minutes.'
            : "Your code wasn't checked. Try it again in a few minutes."}
        </AlertDescription>
      </Alert>
    )
  }
  if (notice?.kind === 'offline') {
    return (
      <Alert variant="destructive">
        <WifiOffIcon />
        <AlertTitle>Couldn't reach dr.serp.co</AlertTitle>
        <AlertDescription>
          {notice.action === 'send'
            ? 'Check your connection and try again.'
            : 'Check your connection, then try the code again.'}
        </AlertDescription>
      </Alert>
    )
  }
  if (notice?.kind === 'failed') {
    return (
      <Alert variant="destructive">
        <CircleXIcon />
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription>Reload the page and try again.</AlertDescription>
      </Alert>
    )
  }
  return null
}

function codeErrorMessage(error: CodeError, limitSeconds: number): string | null {
  switch (error?.kind) {
    case 'wrong':
      return error.attemptsLeft === null
        ? "That code isn't right. Check the most recent email and try again."
        : `That code isn't right. ${error.attemptsLeft} ${error.attemptsLeft === 1 ? 'try' : 'tries'} left.`
    case 'expired':
      return `That code expired. Codes work for ${CODE_LIFETIME_MINUTES} minutes. Send a new code.`
    case 'attempts':
      return 'Too many wrong tries. Send a new code.'
    case 'limited':
      return limitSeconds > 0
        ? `Too many tries from this network. Try again in ${formatWait(limitSeconds)}.`
        : null
    default:
      return null
  }
}

/** The current time, ticking every second while `active`, for the countdowns. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active])
  return now
}
