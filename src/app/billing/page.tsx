import { BillingStatusCard } from "@/app/_components/billing-status-card"
import { Section, SectionDescription, SectionGroup, SectionHeader, SectionTitle } from "@/components/content/section"

export default function BillingPage() {
  return (
    <main className="w-full flex-1">
      <SectionGroup>
        <Section>
          <SectionHeader className="text-center">
            <SectionTitle>Billing</SectionTitle>
            <SectionDescription>Review your plan, renewal date, and payment status.</SectionDescription>
          </SectionHeader>
        </Section>

        <Section>
          <div className="mx-auto flex w-full max-w-2xl justify-center">
            <BillingStatusCard />
          </div>
        </Section>
      </SectionGroup>
    </main>
  )
}
