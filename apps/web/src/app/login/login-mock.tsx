'use client'

import { AlertCircleIcon, RefreshCwIcon, WifiOffIcon } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
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
import { Wordmark } from '@/components/wordmark'

const EMAIL = 'devin@serp.example'
const CODE_STATES = new Set(['code', 'wrong', 'locked', 'expired', 'network'])

/** Every state of the sign-in screen; `state` comes from the URL. */
export function LoginMock({ state }: { state: string }) {
  const codeStep = CODE_STATES.has(state)
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div
        className={
          codeStep ? 'flex w-full max-w-md flex-col gap-6' : 'flex w-full max-w-sm flex-col gap-6'
        }
      >
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

// shadcn's InputOTP "Form" example (base-nova), as shipped: the card, the label row with Resend
// Code, the large slots, the invalid state and the footer. Only the copy is dr.serp.co's.
const SLOTS =
  '*:data-[slot=input-otp-slot]:h-12 *:data-[slot=input-otp-slot]:w-11 *:data-[slot=input-otp-slot]:text-xl'

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
  const invalid = error ? true : undefined
  return (
    <>
      <CardHeader>
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          If <span className="font-medium">{EMAIL}</span> is a valid address, we sent it a 6-digit
          code. It works for 10 minutes, in this browser.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={event => event.preventDefault()} className="flex flex-col gap-4">
          {state === 'network' ? (
            <Alert variant="destructive">
              <WifiOffIcon />
              <AlertTitle>Couldn't reach dr.serp.co</AlertTitle>
              <AlertDescription>Check your connection, then try the code again.</AlertDescription>
            </Alert>
          ) : null}
          <Field data-invalid={invalid}>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="otp-verification">Verification code</FieldLabel>
              <Button variant="outline" size="xs" type="button" disabled={!spent}>
                <RefreshCwIcon data-icon="inline-start" />
                {spent ? 'Resend code' : 'Resend in 0:42'}
              </Button>
            </div>
            <InputOTP
              maxLength={6}
              id="otp-verification"
              required
              value={value}
              onChange={setValue}
              disabled={spent}
            >
              <InputOTPGroup className={SLOTS}>
                <InputOTPSlot index={0} aria-invalid={invalid} />
                <InputOTPSlot index={1} aria-invalid={invalid} />
                <InputOTPSlot index={2} aria-invalid={invalid} />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup className={SLOTS}>
                <InputOTPSlot index={3} aria-invalid={invalid} />
                <InputOTPSlot index={4} aria-invalid={invalid} />
                <InputOTPSlot index={5} aria-invalid={invalid} />
              </InputOTPGroup>
            </InputOTP>
            {error ? <FieldError errors={[{ message: error }]} /> : null}
            <FieldDescription>
              <a href="/login">Wrong address? Use a different email.</a>
            </FieldDescription>
          </Field>
        </form>
      </CardContent>
      <CardFooter className="flex-col gap-2">
        <Button type="submit" className="w-full" disabled={spent || value.length !== 6}>
          Sign in
        </Button>
        <div className="text-sm text-muted-foreground">
          No email? Check your spam folder, or resend the code.
        </div>
      </CardFooter>
    </>
  )
}
