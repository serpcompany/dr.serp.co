import type React from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@/components/ui/input-otp'
import { SIGN_IN_CODE_LENGTH } from '@/lib/sign-in-code'
import { cn } from '@/lib/utils'

type OTPFormProps = Omit<React.ComponentProps<'div'>, 'onSubmit'> & {
  email: string
  code: string
  loading?: boolean
  error?: string | null
  onCodeChange: (value: string) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onEditEmail: () => void
}

export function OTPForm({
  className,
  email,
  code,
  loading = false,
  error = null,
  onCodeChange,
  onSubmit,
  onEditEmail,
  ...props
}: OTPFormProps) {
  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-xl font-bold">Enter verification code</h1>
            <FieldDescription>
              We sent a {SIGN_IN_CODE_LENGTH}-digit code to{' '}
              <span className="font-medium text-foreground">{email}</span>.
            </FieldDescription>
          </div>
          <Field>
            <FieldLabel htmlFor="otp" className="sr-only">
              Verification code
            </FieldLabel>
            <InputOTP
              maxLength={SIGN_IN_CODE_LENGTH}
              id="otp"
              required
              value={code}
              onChange={onCodeChange}
              disabled={loading}
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
              <FieldDescription className="text-center text-destructive">{error}</FieldDescription>
            ) : (
              <FieldDescription className="text-center">
                Enter the code to continue.
              </FieldDescription>
            )}
          </Field>
          <Field>
            <Button type="submit" disabled={loading || code.length !== SIGN_IN_CODE_LENGTH}>
              {loading ? 'Verifying...' : 'Verify'}
            </Button>
          </Field>
          <Field>
            <Button type="button" variant="outline" onClick={onEditEmail} disabled={loading}>
              Edit email
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  )
}
