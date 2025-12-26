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

export default function PricingPage() {
  return (
    <main className="w-full flex-1">
      <SectionGroup>
        <Section>
          <SectionHeader className="text-center">
            <SectionTitle className="text-3xl font-semibold tracking-tight">Pricing</SectionTitle>
            <SectionDescription>Simple pricing while we ship the MVP.</SectionDescription>
          </SectionHeader>
        </Section>

        <Section>
          <ActionCardGroup className="grid gap-6 md:grid-cols-2">
            <ActionCard>
              <ActionCardHeader>
                <ActionCardTitle>Free</ActionCardTitle>
                <ActionCardDescription>Generate shareable pages and badges.</ActionCardDescription>
              </ActionCardHeader>
              <ActionCardContent>
                <p className="text-3xl font-semibold">$0</p>
                <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                  <li>Public DR page per domain</li>
                  <li>Embeddable verified badge</li>
                  <li>Recheck button (best-effort)</li>
                </ul>
              </ActionCardContent>
              <ActionCardFooter>
                <Button asChild className="w-full">
                  <Link href="/">Get started</Link>
                </Button>
              </ActionCardFooter>
            </ActionCard>

            <ActionCard>
              <ActionCardHeader>
                <ActionCardTitle>Pro</ActionCardTitle>
                <ActionCardDescription>For teams and higher volume.</ActionCardDescription>
              </ActionCardHeader>
              <ActionCardContent>
                <p className="text-3xl font-semibold">Contact</p>
                <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                  <li>Higher rate limits</li>
                  <li>Priority support</li>
                  <li>Custom badge designs</li>
                </ul>
              </ActionCardContent>
              <ActionCardFooter>
                <Button variant="secondary" asChild className="w-full">
                  <a href="mailto:devin@serp.co?subject=DR%20Badge%20Pro">Email us</a>
                </Button>
              </ActionCardFooter>
            </ActionCard>
          </ActionCardGroup>
        </Section>
      </SectionGroup>
    </main>
  )
}
