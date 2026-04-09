import type { ComponentProps, ReactNode } from "react"

import { cva, type VariantProps } from "class-variance-authority"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

const formCardVariants = cva("group relative w-full overflow-hidden", {
  variants: {
    variant: {
      default: "",
      destructive: "border-destructive",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

export function FormCard({
  children,
  className,
  variant,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof formCardVariants>) {
  return (
    <Card className={cn(formCardVariants({ variant }), className)} {...props}>
      {children}
    </Card>
  )
}

export function FormCardHeader({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <CardHeader className={cn(className)} {...props}>
      {children}
    </CardHeader>
  )
}

export function FormCardTitle({ children }: { children: ReactNode }) {
  return <CardTitle>{children}</CardTitle>
}

export function FormCardDescription({ children }: { children: ReactNode }) {
  return <CardDescription>{children}</CardDescription>
}

export function FormCardContent({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <CardContent className={cn(className)} {...props}>
      {children}
    </CardContent>
  )
}

export function FormCardSeparator() {
  return <div className="border-t" />
}

const formCardFooterVariants = cva("border-t pt-6", {
  variants: {
    variant: {
      default: "",
      destructive: "border-destructive bg-destructive/5",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

export function FormCardFooter({
  children,
  className,
  variant,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof formCardFooterVariants>) {
  return (
    <CardFooter className={cn(formCardFooterVariants({ variant }), className)} {...props}>
      {children}
    </CardFooter>
  )
}

export function FormCardFooterInfo({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer-info"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function FormCardGroup({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <div data-slot="card-group" className={cn("flex flex-col gap-6", className)} {...props}>
      {children}
    </div>
  )
}

export function FormCardUpgrade({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <div data-slot="card-upgrade" className={cn("hidden", className)} {...props}>
      {children}
    </div>
  )
}

export function FormCardEmpty({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-empty"
      className={cn(
        "pointer-events-none absolute inset-0 z-10 bg-background/70 backdrop-blur-sm",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
