'use client'

import { AlertCircleIcon, ArrowLeftIcon, WifiOffIcon } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@/components/ui/input-otp'
import { Wordmark } from '@/components/wordmark'

const EMAIL = 'devin@serp.example'
const CODE_STATES = new Set(['code', 'wrong', 'locked', 'expired', 'network'])

/** Every state of the sign-in screen; `state` comes from the URL. */
export function LoginMock({ state }: { state: string }) {
  const codeStep = CODE_STATES.has(state)
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link href="/" className="flex items-center gap-2 self-center font-medium">
          <Wordmark />
        </Link>
        <Card>{codeStep ? <CodeStep state={state} /> : <EmailStep state={state} />}</Card>
        <FieldDescription className="px-6 text-center">
          No password. Your first sign-in creates your account.
        </FieldDescription>
      </div>
    </div>
  )
}

function EmailStep({ state }: { state: string }) {
  const invalid = state === 'invalid'
  return (
    <>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Sign in</CardTitle>
        <CardDescription>We'll email you a 6-digit code.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={event => event.preventDefault()}>
          <FieldGroup>
            {state === 'rate' ? (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>Too many requests</AlertTitle>
                <AlertDescription>Try again in 42 seconds.</AlertDescription>
              </Alert>
            ) : null}
            {state === 'unavailable' ? (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>Sign-in codes are unavailable right now</AlertTitle>
                <AlertDescription>Nothing was sent. Try again in a few minutes.</AlertDescription>
              </Alert>
            ) : null}
            <Field data-invalid={invalid || undefined}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                defaultValue={invalid ? 'devin@serp' : state ? EMAIL : ''}
                aria-invalid={invalid || undefined}
                autoComplete="email"
              />
              {invalid ? (
                <FieldError>Enter a full email address, like you@example.com.</FieldError>
              ) : null}
            </Field>
            <Field>
              <Button type="submit" disabled={state === 'rate'}>
                {state === 'rate' ? 'Send code (0:42)' : 'Send code'}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </>
  )
}

function CodeStep({ state }: { state: string }) {
  const [value, setValue] = useState(
    state === 'wrong' ? '482913' : state === 'network' ? '518204' : ''
  )
  const error =
    state === 'wrong'
      ? "That code isn't right. 2 tries left."
      : state === 'locked'
        ? 'Too many wrong tries. Send a new code.'
        : state === 'expired'
          ? 'That code expired. Send a new code.'
          : null
  const spent = state === 'locked' || state === 'expired'
  return (
    <>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Check your email</CardTitle>
        <CardDescription>
          If <span className="font-medium text-foreground">{EMAIL}</span> is a valid address, a
          6-digit code is on its way. It works for 10 minutes, in this browser.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={event => event.preventDefault()}>
          <FieldGroup>
            {state === 'network' ? (
              <Alert variant="destructive">
                <WifiOffIcon />
                <AlertTitle>Couldn't reach dr.serp.co</AlertTitle>
                <AlertDescription>Check your connection, then try the code again.</AlertDescription>
              </Alert>
            ) : null}
            <Field data-invalid={error ? true : undefined} className="items-center">
              <FieldLabel htmlFor="otp" className="sr-only">
                Code
              </FieldLabel>
              <InputOTP
                id="otp"
                maxLength={6}
                value={value}
                onChange={setValue}
                disabled={spent}
                aria-invalid={error ? true : undefined}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                </InputOTPGroup>
                <InputOTPSeparator />
                <InputOTPGroup>
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
              {error ? (
                <FieldError className="text-center">{error}</FieldError>
              ) : (
                <FieldDescription className="text-center">
                  Paste it or type it. It checks itself at 6 digits.
                </FieldDescription>
              )}
            </Field>
            <Field>
              {spent ? (
                <Button type="button">Send a new code</Button>
              ) : (
                <Button type="submit" disabled={value.length !== 6}>
                  Sign in
                </Button>
              )}
              {spent ? null : (
                <Button type="button" variant="ghost" disabled>
                  Resend code in 0:42
                </Button>
              )}
            </Field>
            <Button type="button" variant="link" size="sm" className="self-center">
              <ArrowLeftIcon />
              Use a different email
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </>
  )
}
