import Link from 'next/link'
import { BillingEntry } from '@/app/_components/billing-entry'
import { PricingSelector } from '@/app/pricing/pricing-selector'
import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { FREE_FEATURES } from '@/lib/pricing'
import { cn } from '@/lib/utils'

export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-8 px-4 py-8">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Pricing</h1>
        <p className="text-muted-foreground">
          Pick a plan based on how many domains you want to monitor. Paid plans update once a week
          and include on-demand refreshes.
        </p>
      </div>

      <div className="flex justify-center">
        <BillingEntry />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader>
            <CardTitle>Free</CardTitle>
            <CardDescription>Generate shareable pages and badges.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">$0</p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              {FREE_FEATURES.map(feature => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Link href="/account" className={cn(buttonVariants(), 'w-full')}>
              Get started
            </Link>
          </CardFooter>
        </Card>

        <PricingSelector />
      </div>
    </main>
  )
}
