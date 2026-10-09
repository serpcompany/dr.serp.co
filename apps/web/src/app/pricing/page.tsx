import { CheckIcon } from 'lucide-react'
import Link from 'next/link'
import { PlanPicker } from '@/app/account/_mock/plan-picker'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { FREE_FEATURES, PAID_FEATURES } from '@/lib/pricing'
import { cn } from '@/lib/utils'

function Features({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {items.map(item => (
        <li key={item} className="flex gap-2">
          <CheckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export default function PricingPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">Pricing</h1>
        <p className="text-muted-foreground text-balance">
          Every site gets a public DR page and a badge for free. A plan lets you claim your sites:
          pick how many.
        </p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.5fr]">
        <Card>
          <CardHeader>
            <CardTitle>Free</CardTitle>
            <CardDescription>For any site, no account needed.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <p className="text-3xl font-semibold">$0</p>
            <Features items={FREE_FEATURES} />
          </CardContent>
          <CardFooter>
            <Link href="/" className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}>
              Look up a site
            </Link>
          </CardFooter>
        </Card>
        <Card className="ring-2 ring-primary">
          <CardHeader>
            <CardTitle>Claim your sites</CardTitle>
            <CardDescription>Everything in Free, for every site you claim.</CardDescription>
            <CardAction>
              <Badge>Most sites</Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <PlanPicker selected="25" />
            <Separator />
            <Features items={PAID_FEATURES} />
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button className="w-full">Continue</Button>
            <span className="text-xs text-muted-foreground">
              Sign in first if you're not; you'll pay on Stripe's checkout page.
            </span>
          </CardFooter>
        </Card>
      </div>
    </main>
  )
}
