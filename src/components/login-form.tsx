import type React from "react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

type LoginFormProps = Omit<React.ComponentProps<"div">, "onSubmit"> & {
  email: string
  loading?: boolean
  error?: string | null
  onEmailChange: (value: string) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}

export function LoginForm({
  className,
  email,
  loading = false,
  error = null,
  onEmailChange,
  onSubmit,
  ...props
}: LoginFormProps) {
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
          </div>
          <Field>
            <Input
              id="email"
              type="email"
              placeholder="astley@rick.roll"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              required
              disabled={loading}
            />
            {error ? (
              <FieldDescription className="text-destructive">{error}</FieldDescription>
            ) : null}
          </Field>
          <Field>
            <Button type="submit" disabled={loading || !email.trim()}>
              {loading ? "Sending..." : "Send code"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  )
}
