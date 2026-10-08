import { BillingStatusCard } from '@/app/_components/billing-status-card'

export default function BillingPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-8 px-4 py-8">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-muted-foreground">Review your plan, renewal date, and payment status.</p>
      </div>

      <div className="mx-auto flex w-full max-w-2xl justify-center">
        <BillingStatusCard />
      </div>
    </main>
  )
}
