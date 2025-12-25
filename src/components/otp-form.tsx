import type React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"

type OTPFormProps = React.ComponentPropsWithoutRef<"div"> & {
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
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form onSubmit={onSubmit}>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-xl font-bold">Enter your code</h1>
            <p className="text-sm text-muted-foreground">
              We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>.
            </p>
          </div>
          <div className="flex flex-col items-center gap-4">
            <InputOTP maxLength={6} value={code} onChange={onCodeChange}>
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <InputOTPSlot key={index} index={index} />
                ))}
              </InputOTPGroup>
            </InputOTP>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
              {loading ? "Verifying..." : "Verify code"}
            </Button>
            <Button type="button" variant="outline" onClick={onEditEmail} disabled={loading}>
              Edit email
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
