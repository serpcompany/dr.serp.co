import type { Metadata } from 'next'
import { PricingPlans } from './pricing-plans'

export const metadata: Metadata = {
  title: 'Pricing | SERP DR',
  description: 'Every site gets a public DR page and a badge for free. A plan lets you claim yours.'
}

// #140 mockups, Public · Pricing. The feature lists stay as they are until #53 decides them.
export default function PricingPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">Pricing</h1>
        <p className="text-balance text-muted-foreground">
          Every site gets a public DR page and a badge for free. A plan lets you claim your sites:
          pick how many.
        </p>
      </div>
      <PricingPlans />
    </main>
  )
}
