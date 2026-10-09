'use client'

import { CheckIcon } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { PlanPicker } from '@/components/account/plan-picker'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
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
import { FREE_FEATURES, PAID_FEATURES, type PlanChoice } from '@/lib/pricing'
import { cn } from '@/lib/utils'

function Features({ items }: { items: readonly string[] }) {
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

/**
 * Free beside "Claim your sites" (#140 mockups, Pricing). Continue goes to the account's billing
 * page with the plan chosen; signed out, that page sends the visitor through /login first.
 */
export function PricingPlans() {
  const [choice, setChoice] = useState<PlanChoice>({ domains: 25, billing: 'monthly' })
  return (
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
          <PlanPicker value={choice} onChange={setChoice} />
          <Separator />
          <Features items={PAID_FEATURES} />
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Link
            href={`/account/billing?plan=${choice.domains}&period=${choice.billing}`}
            className={cn(buttonVariants(), 'w-full')}
          >
            Continue
          </Link>
          <span className="text-xs text-muted-foreground">
            Sign in first if you're not; you'll pay on Stripe's checkout page.
          </span>
        </CardFooter>
      </Card>
    </div>
  )
}
