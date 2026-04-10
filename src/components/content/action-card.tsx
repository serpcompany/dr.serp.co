import type { ComponentProps } from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function ActionCard({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <Card
      className={cn("group/action-card transition-colors hover:bg-accent", className)}
      {...props}
    >
      {children}
    </Card>
  )
}

export function ActionCardHeader({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <CardHeader className={cn(className)} {...props}>
      {children}
    </CardHeader>
  )
}

export function ActionCardGroup({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("grid gap-4", className)} {...props}>
      {children}
    </div>
  )
}

export function ActionCardTitle({ children, ...props }: ComponentProps<"div">) {
  return <CardTitle {...props}>{children}</CardTitle>
}

export function ActionCardDescription({ children, ...props }: ComponentProps<"div">) {
  return <CardDescription {...props}>{children}</CardDescription>
}

export function ActionCardContent({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <CardContent className={cn(className)} {...props}>
      {children}
    </CardContent>
  )
}

export function ActionCardFooter({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <CardFooter className={cn(className)} {...props}>
      {children}
    </CardFooter>
  )
}
