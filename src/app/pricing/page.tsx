import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  ActionCard,
  ActionCardContent,
  ActionCardDescription,
  ActionCardFooter,
  ActionCardGroup,
  ActionCardHeader,
  ActionCardTitle,
} from "@/components/content/action-card"
import { Section, SectionDescription, SectionGroup, SectionHeader, SectionTitle } from "@/components/content/section"
import { PricingSelector } from "@/app/pricing/pricing-selector"
import { FREE_FEATURES } from "@/lib/pricing"
import { BillingEntry } from "@/app/_components/billing-entry"

export default function PricingPage() {
  return (
    <main className="w-full flex-1">
      <SectionGroup>
        <Section>
          <SectionHeader className="text-center">
            <SectionTitle className="text-3xl font-semibold tracking-tight">Pricing</SectionTitle>
            <SectionDescription>
              Pick a plan based on how many domains you want to monitor. Paid plans update once a week and
              include on-demand refreshes.
            </SectionDescription>
          </SectionHeader>
        </Section>

        <Section>
          <div className="flex justify-center">
            <BillingEntry />
          </div>
        </Section>

        <Section>
          <ActionCardGroup className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
            <ActionCard>
              <ActionCardHeader>
                <ActionCardTitle>Free</ActionCardTitle>
                <ActionCardDescription>Generate shareable pages and badges.</ActionCardDescription>
              </ActionCardHeader>
              <ActionCardContent>
                <p className="text-3xl font-semibold">$0</p>
                <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                  {FREE_FEATURES.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              </ActionCardContent>
              <ActionCardFooter>
                <Button asChild className="w-full">
                  <Link href="/">Get started</Link>
                </Button>
              </ActionCardFooter>
            </ActionCard>

            <PricingSelector />
          </ActionCardGroup>
        </Section>
      </SectionGroup>
    </main>
  )
}
