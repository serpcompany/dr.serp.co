import { Suspense } from 'react'
import { PageLoading } from '@/components/account/page-loading'
import { type PlanChoice, planFromSearch } from '@/lib/pricing'
import { requireAccount, requireSignIn } from '@/server/account'
import { BILLING_TITLE, FreeBilling, PlanBilling } from './billing-states'

export const dynamic = 'force-dynamic'

type Search = Record<string, string | string[] | undefined>

// #140 mockups, Billing. Signed out, a 307 to /login (with the plan asked for) before anything
// streams; then the account loads behind a skeleton.
export default async function AccountBilling({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams
  const asked = planFromSearch(params)
  const path = `/account/billing${asked ? `?plan=${asked.domains}&period=${asked.billing}` : ''}`
  await requireSignIn(path)
  return (
    <Suspense
      fallback={
        <PageLoading
          title={BILLING_TITLE}
          description="Your plan, what it costs and what it covers."
        />
      }
    >
      <Billing
        path={path}
        asked={asked}
        checkout={typeof params.checkout === 'string' ? params.checkout : undefined}
      />
    </Suspense>
  )
}

async function Billing({
  path,
  asked,
  checkout
}: {
  path: string
  asked: PlanChoice | null
  /** What Stripe Checkout came back with: success or cancelled. */
  checkout: string | undefined
}) {
  const account = await requireAccount(path)
  return account.plan.kind === 'free' ? (
    <FreeBilling account={account} asked={asked} checkout={checkout} />
  ) : (
    <PlanBilling account={account} asked={asked} checkout={checkout} />
  )
}
